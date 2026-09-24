import { test, expect } from "bun:test";
import {
    formatDuration,
    formatPercent,
    formatLatency,
    formatCertDays,
    heldText,
    sparkline,
    toMs,
} from "../src/model.js";

test("Unix seconds are read as milliseconds", () => {
    expect(toMs(1750000000)).toBe(1750000000 * 1000);
});

test("values already in milliseconds are left alone", () => {
    expect(toMs(1750000000000)).toBe(1750000000000);
});

test("an unreadable time is no time at all", () => {
    expect(toMs(null)).toBe(null);
    expect(toMs(0)).toBe(null);
    expect(toMs(-1)).toBe(null);
});

test("durations read in the largest two units that carry information", () => {
    expect(formatDuration(42 * 1000)).toBe("42s");
    expect(formatDuration(9 * 60 * 1000)).toBe("9m");
    expect(formatDuration((3 * 60 + 11) * 60 * 1000)).toBe("3h 11m");
    expect(formatDuration((2 * 24 + 5) * 3600 * 1000)).toBe("2d 5h");
    expect(formatDuration(3 * 3600 * 1000)).toBe("3h");
    expect(formatDuration(2 * 86400 * 1000)).toBe("2d");
});

test("a negative span is treated as zero rather than a clock running backwards", () => {
    expect(formatDuration(-5000)).toBe("0s");
});

test("an uptime percentage keeps only the digits that differ", () => {
    expect(formatPercent(99.87)).toBe("99.87%");
    expect(formatPercent(95)).toBe("95%");
    expect(formatPercent(100)).toBe("100%");
});

test("absent figures are blank, never a dash", () => {
    expect(formatPercent(null)).toBe("");
    expect(formatLatency(null)).toBe("");
    expect(formatCertDays(null)).toBe("");
});

test("latency is whole milliseconds", () => {
    expect(formatLatency(12.4)).toBe("12 ms");
    expect(formatLatency(31)).toBe("31 ms");
});

test("a certificate says how long it has left, or that it has none", () => {
    expect(formatCertDays(21)).toBe("21 days");
    expect(formatCertDays(1)).toBe("1 day");
    expect(formatCertDays(0)).toBe("expired");
    expect(formatCertDays(-3)).toBe("expired");
});

test("heldText walks back through down logs for a Down monitor", () => {
    const now = Date.UTC(2026, 8, 23, 12, 0, 0);
    const monitor = { status: 9 };
    const logs = [
        { type: 2, datetime: Math.floor(now / 1000) - 7200 },
        { type: 1, datetime: Math.floor(now / 1000) - 1800 },
        { type: 1, datetime: Math.floor(now / 1000) - 60 },
    ];

    expect(heldText(monitor, logs, now)).toBe("for 30m");
});

test("heldText is empty when there is no log to start from", () => {
    expect(heldText({ status: 2 }, [], Date.now())).toBe("");
});

test("sparkline height is latency against the slowest sample", () => {
    const samples = sparkline({
        status: 2,
        response_times: [
            { datetime: 1, value: 10 },
            { datetime: 2, value: 100 },
        ],
    });

    expect(samples).toHaveLength(2);
    expect(samples[1].level).toBe(1);
    expect(samples[0].level).toBeLessThan(samples[1].level);
});
