import { test, expect } from "bun:test";
import { pollSeconds, graceSeconds, POLL_MIN, POLL_MAX, GRACE_MAX } from "../src/settings.js";

test("nothing configured means a 20s poll and no grace", () => {
    expect(pollSeconds(undefined)).toBe(20);
    expect(graceSeconds(undefined)).toBe(0);
    expect(pollSeconds(null)).toBe(20);
    expect(graceSeconds("")).toBe(0);
});

test("a configured value within bounds is used as is", () => {
    expect(pollSeconds(30)).toBe(30);
    expect(graceSeconds(45)).toBe(45);
    expect(pollSeconds("60")).toBe(60);
});

test("values outside the bounds are clamped", () => {
    expect(pollSeconds(0)).toBe(POLL_MIN);
    expect(pollSeconds(5)).toBe(POLL_MIN);
    expect(pollSeconds(1e9)).toBe(POLL_MAX);
    expect(graceSeconds(-10)).toBe(0);
    expect(graceSeconds(1e9)).toBe(GRACE_MAX);
});

test("fractions round to whole seconds", () => {
    expect(pollSeconds(20.6)).toBe(21);
    expect(graceSeconds(0.4)).toBe(0);
});

test("anything that is not a number falls back to the default", () => {
    expect(pollSeconds("fast")).toBe(20);
    expect(pollSeconds(NaN)).toBe(20);
    expect(pollSeconds(Infinity)).toBe(20);
    expect(graceSeconds(true)).toBe(0);
    expect(graceSeconds({})).toBe(0);
});

test("the minimum poll stays inside the free plan's rate limit", () => {
    // One monitor-groups request plus one getMonitors page per poll.
    expect((60 / POLL_MIN) * 2).toBeLessThanOrEqual(10);
});
