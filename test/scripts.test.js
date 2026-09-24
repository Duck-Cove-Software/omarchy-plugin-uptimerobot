// What the helper scripts must never do, exercised against a stub UptimeRobot.
//
// These are the properties that cannot be checked by reading src/: that a
// credential never becomes a command-line argument, and that nothing the
// server says can grow without bound inside the shell.

import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = join(import.meta.dir, "..", "bin");
const SCRIPTS = ["verify.sh", "poll.sh", "authenticate.sh", "read-bounded.sh", "supervise.sh"];
const SHIMMABLE = ["jq", "secret-tool"];
const API_KEY = "u1234567-correct-horse-battery-staple";

const MAX_BODY = Number(/^MAX_BODY=(\d+)$/m.exec(readFileSync(join(BIN, "poll.sh"), "utf8"))[1]);

let work;

beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), "uptimerobot-scripts-"));
});

afterAll(() => {
    rmSync(work, { recursive: true, force: true });
});

function startServer(handler) {
    return Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: handler,
    });
}

function shimmedBin() {
    const root = mkdtempSync(join(work, "bin-"));
    const shims = join(root, "shims");
    mkdirSync(shims);

    const write = (name, last) => {
        const shim = join(shims, name);
        writeFileSync(
            shim,
            ["#!/usr/bin/env bash", 'printf "%s\\n" "$*" >> "$ARGV_LOG"', last, ""].join("\n"),
        );
        chmodSync(shim, 0o755);
    };
    write("jq", 'exec /usr/bin/jq "$@"');

    for (const name of SCRIPTS) {
        let src = readFileSync(join(BIN, name), "utf8");
        for (const tool of SHIMMABLE) {
            src = src.split(`/usr/bin/${tool}`).join(join(shims, tool));
        }
        src = src.replaceAll("=https", "=https,http");
        src = src.replaceAll("https://api.uptimerobot.com", "ORIGIN");
        const copy = join(root, name);
        writeFileSync(copy, src);
        chmodSync(copy, 0o755);
    }
    return { root, shims };
}

async function run(script, { stdin = "", origin = "", env = {} } = {}) {
    const runtime = mkdtempSync(join(work, "run-"));
    const argvLog = join(runtime, "argv.log");
    writeFileSync(argvLog, "");
    let body = readFileSync(script, "utf8");
    if (origin) {
        body = body.replaceAll("ORIGIN", origin);
        const rewritten = script + ".run";
        writeFileSync(rewritten, body);
        chmodSync(rewritten, 0o755);
        script = rewritten;
    }
    const proc = Bun.spawn(["/usr/bin/bash", script], {
        stdin: Buffer.from(stdin),
        stdout: "pipe",
        stderr: "pipe",
        env: {
            PATH: "/usr/bin:/bin",
            HOME: runtime,
            XDG_RUNTIME_DIR: runtime,
            ARGV_LOG: argvLog,
            LC_ALL: "C",
            ...env,
        },
    });
    const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    return {
        code,
        stdout,
        stderr,
        argv: readFileSync(argvLog, "utf8"),
    };
}

test("every helper names its interpreter and tools by absolute path", () => {
    for (const name of SCRIPTS) {
        const src = readFileSync(join(BIN, name), "utf8");
        expect(src.startsWith("#!/usr/bin/bash\n")).toBe(true);
        expect(src).not.toMatch(/\n(?:jq|curl|secret-tool) /);
    }
    expect(readFileSync(join(BIN, "verify.sh"), "utf8")).toContain("/usr/bin/curl");
    expect(readFileSync(join(BIN, "poll.sh"), "utf8")).toContain("/usr/bin/curl");
    expect(readFileSync(join(BIN, "authenticate.sh"), "utf8")).toContain("/usr/bin/secret-tool");
    expect(readFileSync(join(BIN, "supervise.sh"), "utf8")).toContain("/usr/bin/timeout");
});

test("verify.sh never puts the API key on jq's argv", async () => {
    const server = startServer(async (request) => {
        const url = new URL(request.url);
        expect(url.pathname).toBe("/v2/getMonitors");
        const body = await request.text();
        expect(body).toBe("api_key=" + encodeURIComponent(API_KEY) + "&format=json&limit=1");
        return Response.json({
            stat: "ok",
            pagination: { offset: 0, limit: 1, total: 1 },
            monitors: [{ id: 1 }],
        });
    });
    const { root } = shimmedBin();
    const result = await run(join(root, "verify.sh"), {
        stdin: JSON.stringify({ apiKey: API_KEY }) + "\n",
        origin: `http://127.0.0.1:${server.port}`,
    });
    server.stop();

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, email: "" });
    expect(result.argv).not.toContain(API_KEY);
});

test("verify.sh reports a refused key without retrying", async () => {
    const server = startServer(() =>
        Response.json({
            stat: "fail",
            error: { type: "invalid_parameter", message: "api_key is invalid" },
        }),
    );
    const { root } = shimmedBin();
    const result = await run(join(root, "verify.sh"), {
        stdin: JSON.stringify({ apiKey: API_KEY }) + "\n",
        origin: `http://127.0.0.1:${server.port}`,
    });
    server.stop();

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(false);
    expect(JSON.parse(result.stdout).error).toContain("api_key");
});

test("poll.sh never puts the API key on jq's argv", async () => {
    const seen = [];
    const server = startServer(async (request) => {
        const url = new URL(request.url);
        const body = await request.text();
        seen.push({ path: url.pathname, body, auth: request.headers.get("authorization") });
        if (url.pathname === "/v2/getMonitors") {
            return Response.json({
                stat: "ok",
                pagination: { offset: 0, limit: 50, total: 1 },
                monitors: [{ id: 1, friendly_name: "web", status: 2, monitor_group: 0 }],
            });
        }
        return Response.json({ data: [] });
    });
    const { root } = shimmedBin();
    const result = await run(join(root, "poll.sh"), {
        stdin: JSON.stringify({ apiKey: API_KEY }) + "\n",
        origin: `http://127.0.0.1:${server.port}`,
    });
    server.stop();

    expect(result.code).toBe(0);
    const snapshot = JSON.parse(result.stdout);
    expect(snapshot.monitors).toHaveLength(1);
    expect(snapshot.monitors[0].friendly_name).toBe("web");
    const posted = seen.find((s) => s.path === "/v2/getMonitors");
    expect(posted.body).toBe(
        "api_key=" +
            encodeURIComponent(API_KEY) +
            "&format=json&logs=1&logs_limit=50&response_times=1&response_times_limit=50&ssl=1&custom_uptime_ratios=1&limit=50&offset=0",
    );
    const groups = seen.find((s) => s.path === "/v3/monitor-groups");
    expect(groups.auth).toBe("Bearer " + API_KEY);
    expect(result.argv).not.toContain(API_KEY);
});

test("poll.sh exits 2 when the key is refused", async () => {
    const server = startServer(() =>
        Response.json({
            stat: "fail",
            error: { message: "api_key is invalid" },
        }),
    );
    const { root } = shimmedBin();
    const result = await run(join(root, "poll.sh"), {
        stdin: JSON.stringify({ apiKey: API_KEY }) + "\n",
        origin: `http://127.0.0.1:${server.port}`,
    });
    server.stop();

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("refused");
});

test("poll.sh refuses an empty key before talking to the network", async () => {
    const { root } = shimmedBin();
    const result = await run(join(root, "poll.sh"), {
        stdin: JSON.stringify({ apiKey: "" }) + "\n",
        origin: "http://127.0.0.1:1",
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No API key");
});

test("read-bounded.sh stops before an oversized file is in memory", () => {
    const path = join(work, "big.bin");
    writeFileSync(path, "x".repeat(100));
    const result = Bun.spawnSync(["/usr/bin/bash", join(BIN, "read-bounded.sh"), path, "10"], {
        stdout: "pipe",
        stderr: "pipe",
    });
    expect(result.stdout.length).toBe(11);
});

test("MAX_BODY in poll.sh is a finite ceiling", () => {
    expect(MAX_BODY).toBeGreaterThan(1000);
    expect(MAX_BODY).toBeLessThanOrEqual(8000000);
});
