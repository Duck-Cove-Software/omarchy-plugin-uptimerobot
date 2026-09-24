import { test, expect } from "bun:test";
import { statusOf, isPaused, worstStatus, buildView } from "../src/model.js";

test("a monitor last confirmed working is Up", () => {
    expect(statusOf({ status: 2 })).toBe("up");
});

test("a monitor last confirmed failing is Down", () => {
    expect(statusOf({ status: 9 })).toBe("down");
});

test("a monitor that seems down is Degraded", () => {
    expect(statusOf({ status: 8 })).toBe("degraded");
});

test("a monitor that has never been checked is Degraded, not Up", () => {
    expect(statusOf({ status: 1 })).toBe("degraded");
});

test("a paused monitor is recognised regardless of anything else", () => {
    expect(isPaused({ status: 0 })).toBe(true);
    expect(isPaused({ status: 2 })).toBe(false);
    expect(isPaused({ status: 9 })).toBe(false);
});

test("worstStatus picks Down over Degraded over Up", () => {
    expect(worstStatus(["up", "degraded", "down"])).toBe("down");
    expect(worstStatus(["up", "degraded"])).toBe("degraded");
    expect(worstStatus(["up", "up"])).toBe("up");
});

test("worstStatus of nothing is Up, so an empty group does not raise alarm", () => {
    expect(worstStatus([])).toBe("up");
});

const now = Date.UTC(2026, 8, 23, 12, 0, 0);

const monitors = [
    {
        id: 2,
        friendly_name: "immich-web",
        status: 2,
        monitor_group: 1,
        custom_uptime_ratio: "99.87",
        average_response_time: 31,
        ssl: { expires: Math.floor(now / 1000) + 21 * 86400 },
        logs: [],
        response_times: [{ datetime: Math.floor(now / 1000) - 60, value: 31 }],
    },
    {
        id: 3,
        friendly_name: "immich-db",
        status: 2,
        monitor_group: 1,
        logs: [],
        response_times: [{ datetime: Math.floor(now / 1000) - 60, value: 12 }],
    },
    {
        id: 4,
        friendly_name: "old-thing",
        status: 0,
        monitor_group: 1,
        logs: [],
        response_times: [],
    },
    {
        id: 5,
        friendly_name: "standalone",
        status: 2,
        monitor_group: 0,
        logs: [],
        response_times: [{ datetime: Math.floor(now / 1000) - 60, value: 5 }],
    },
    {
        id: 7,
        friendly_name: "abs-web",
        status: 2,
        monitor_group: 6,
        logs: [],
        response_times: [],
    },
    {
        id: 8,
        friendly_name: "another-standalone",
        status: 2,
        monitor_group: 0,
        logs: [],
        response_times: [],
    },
];

const groups = [
    { id: 1, name: "Immich" },
    { id: 6, name: " Audiobookshelf" },
];

test("buildView nests monitors under their parent group", () => {
    const view = buildView(monitors, groups, now);
    const immich = view.groups.find((g) => g.id === 1);

    expect(immich.children.map((m) => m.name)).toEqual(["immich-db", "immich-web"]);
});

test("groups are listed alphabetically, not in the order they were created", () => {
    const view = buildView(monitors, groups, now);

    expect(view.groups.map((g) => g.name)).toEqual([" Audiobookshelf", "Immich"]);
});

test("sorting ignores stray whitespace around a name", () => {
    const view = buildView(monitors, groups, now);

    expect(view.groups[0].name).toBe(" Audiobookshelf");
    expect(view.groups[1].name).toBe("Immich");
});

test("sorting ignores case, so capitals do not clump", () => {
    const mixed = [
        { id: 1, friendly_name: "zebra", status: 2, monitor_group: 0 },
        { id: 2, friendly_name: "Apple", status: 2, monitor_group: 0 },
    ];

    expect(buildView(mixed, [], now).ungrouped.map((m) => m.name)).toEqual(["Apple", "zebra"]);
});

test("ungrouped monitors are alphabetical too", () => {
    const view = buildView(monitors, groups, now);

    expect(view.ungrouped.map((m) => m.name)).toEqual(["another-standalone", "standalone"]);
});

test("a group reports the worst status among its children", () => {
    const failing = monitors.map((m) => (m.id === 3 ? { ...m, status: 9 } : m));
    const view = buildView(failing, groups, now);

    expect(view.groups.find((g) => g.id === 1).status).toBe("down");
});

test("a monitor with no group stands at the top level", () => {
    const view = buildView(monitors, groups, now);

    expect(view.ungrouped.map((m) => m.name)).toContain("standalone");
});

test("every Down monitor is listed in Problems, flattened out of its group", () => {
    const failing = monitors.map((m) => (m.id === 2 || m.id === 5 ? { ...m, status: 9 } : m));
    const view = buildView(failing, groups, now);

    expect(view.problems.map((m) => m.name)).toEqual(["immich-web", "standalone"]);
});

test("Problems are alphabetical", () => {
    const failing = monitors.map((m) =>
        m.id === 2 || m.id === 3 || m.id === 5 ? { ...m, status: 9 } : m,
    );
    const view = buildView(failing, groups, now);

    expect(view.problems.map((m) => m.name)).toEqual(["immich-db", "immich-web", "standalone"]);
});

test("Paused monitors are hidden from the tree and counted apart", () => {
    const view = buildView(monitors, groups, now);

    expect(view.counts.paused).toBe(1);
    expect(view.groups.find((g) => g.id === 1).children.map((m) => m.id)).not.toContain(4);
});

test("a monitor carries the error text of its last down log", () => {
    const failing = monitors.map((m) =>
        m.id === 2
            ? {
                  ...m,
                  status: 9,
                  logs: [
                      {
                          type: 1,
                          datetime: Math.floor(now / 1000) - 120,
                          reason: { code: "512", detail: "Connection timeout" },
                      },
                  ],
              }
            : m,
    );
    const view = buildView(failing, groups, now);

    expect(view.problems[0].error).toBe("Connection timeout");
});

test("a monitor says how long it has held its status, so a blip reads apart from an outage", () => {
    const failing = monitors.map((m) =>
        m.id === 2
            ? {
                  ...m,
                  status: 9,
                  logs: [
                      { type: 2, datetime: Math.floor(now / 1000) - 3600 },
                      {
                          type: 1,
                          datetime: Math.floor(now / 1000) - 1800,
                          reason: { detail: "ECONNREFUSED" },
                      },
                      {
                          type: 1,
                          datetime: Math.floor(now / 1000) - 1200,
                          reason: { detail: "ECONNREFUSED" },
                      },
                  ],
              }
            : m,
    );
    const view = buildView(failing, groups, now);

    expect(view.problems[0].statusText).toBe("Down");
    expect(view.problems[0].held).toBe("for 30m");
});

test("a monitor carries the figures UptimeRobot reports beside its checks", () => {
    const view = buildView(monitors, groups, now);
    const row = view.groups.find((g) => g.id === 1).children.find((m) => m.id === 2);

    expect(row.uptimeText).toBe("99.87%");
    expect(row.avgPingText).toBe("31 ms");
    expect(row.certText).toBe("21 days");
});

test("figures UptimeRobot has not sent are blank, never guessed at", () => {
    const view = buildView(monitors, groups, now);
    const row = view.groups.find((g) => g.id === 1).children.find((m) => m.id === 3);

    expect(row.uptimeText).toBe("");
    expect(row.avgPingText).toBe("");
    expect(row.certText).toBe("");
});

test("a monitor carries its recent response times as sparkline samples", () => {
    const withTimes = monitors.map((m) =>
        m.id === 2
            ? {
                  ...m,
                  response_times: [
                      { datetime: 1, value: 10 },
                      { datetime: 2, value: 20 },
                  ],
              }
            : m,
    );
    const view = buildView(withTimes, groups, now);
    const row = view.groups.find((g) => g.id === 1).children.find((m) => m.id === 2);

    expect(row.samples.map((s) => s.status)).toEqual(["up", "up"]);
});

test("a currently Down monitor appends a failure bar to the sparkline", () => {
    const failing = monitors.map((m) =>
        m.id === 2
            ? {
                  ...m,
                  status: 9,
                  response_times: [{ datetime: 1, value: 10 }],
              }
            : m,
    );
    const view = buildView(failing, groups, now);
    const row = view.problems[0];

    expect(row.samples.map((s) => s.status)).toEqual(["up", "down"]);
});

test("an unnamed group id still collects its monitors rather than losing them", () => {
    const orphan = [{ id: 9, friendly_name: "orphan-web", status: 2, monitor_group: 42 }];
    const view = buildView(orphan, [], now);

    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].name).toBe("Group 42");
    expect(view.groups[0].children[0].name).toBe("orphan-web");
});
