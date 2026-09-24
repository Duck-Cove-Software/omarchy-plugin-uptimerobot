import { test, expect } from "bun:test";
import { nextNotification, downText } from "../src/alerts.js";
import { plain } from "../src/sanitize.js";

const down = { alerting: true, healthy: false, connection: "connected", downNames: ["api", "web"] };
const green = { alerting: false, healthy: true, connection: "connected" };

test("an account already broken at startup is not news", () => {
    const decision = nextNotification("unknown", down);
    expect(decision.kind).toBe(null);
    expect(decision.next).toBe("unknown");
});

test("the first green snapshot is remembered without a notification", () => {
    expect(nextNotification("unknown", green)).toMatchObject({ kind: null, next: "green" });
    expect(nextNotification("green", green)).toMatchObject({ kind: null, next: "green" });
});

test("green to Down is a critical alert naming what broke", () => {
    expect(nextNotification("green", down)).toEqual({
        kind: "alert",
        urgency: "critical",
        summary: "UptimeRobot: monitor down",
        body: "2 down: api, web",
        next: "alerted",
    });
});

test("green to Unreachable is a critical alert carrying the error", () => {
    const decision = nextNotification("green", {
        alerting: true,
        connection: "unreachable",
        error: "Cannot resolve host",
    });
    expect(decision).toMatchObject({
        kind: "alert",
        urgency: "critical",
        summary: "UptimeRobot unreachable",
    });
    expect(decision.body).toBe("Cannot reach UptimeRobot — Cannot resolve host");
});

test("more going Down while already alerted says nothing", () => {
    const worse = { ...down, downNames: ["api", "web", "db"] };
    expect(nextNotification("alerted", worse)).toMatchObject({ kind: null, next: "alerted" });
});

test("in-between states wait: not green, not yet alerting", () => {
    const degraded = { alerting: false, healthy: false, connection: "connected" };
    expect(nextNotification("green", degraded)).toMatchObject({ kind: null, next: "green" });
    expect(nextNotification("alerted", degraded)).toMatchObject({ kind: null, next: "alerted" });
});

test("alerted to green is a quiet recovery", () => {
    expect(nextNotification("alerted", green)).toMatchObject({
        kind: "recover",
        urgency: "normal",
        summary: "UptimeRobot: all monitors up",
        next: "green",
    });
});

test("a long list of names ends in a count", () => {
    expect(downText(["a", "b", "c", "d", "e"])).toBe("5 down: a, b, c +2 more");
    expect(downText(["a"])).toBe("1 down: a");
});

test("names the Service sanitises carry no markup into the body", () => {
    const names = ['<img src="http://x/">api', "web & co"].map((n) => plain(n));
    const body = nextNotification("green", { ...down, downNames: names }).body;
    expect(body).not.toMatch(/[<>&]/);
});
