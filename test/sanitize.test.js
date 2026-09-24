import { test, expect } from "bun:test";
import { plain, dashboardUrl, MAX_LABEL } from "../src/sanitize.js";

test("ordinary text is handed through unchanged", () => {
    expect(plain("Home Assistant")).toBe("Home Assistant");
    expect(plain("immich-db · 12 ms")).toBe("immich-db · 12 ms");
});

test("markup characters are removed, not escaped", () => {
    expect(plain('<img src="http://127.0.0.1/leak.png">')).toBe(
        'img src="http://127.0.0.1/leak.png"',
    );
    expect(plain("a &amp; b")).toBe("a amp; b");
    expect(plain("<b>bold</b>")).toBe("bbold/b");
});

test("C0, DEL and C1 control characters are removed", () => {
    expect(plain("a\u0000b")).toBe("ab");
    expect(plain("a\nb\tc\rd")).toBe("abcd");
    expect(plain("a\u0007b")).toBe("ab");
    expect(plain("a\u007Fb")).toBe("ab");
    expect(plain("a\u009Bb")).toBe("ab");
    expect(plain("a\u0080b\u009Fc")).toBe("abc");
});

test("bidi overrides are removed", () => {
    expect(plain("robot\u202Egnp.exe")).toBe("robotgnp.exe");
    expect(plain("a\u200Eb\u200Fc\u061Cd")).toBe("abcd");
    expect(plain("a\u202Ab\u202Bc\u202Cd\u202De")).toBe("abcde");
    expect(plain("a\u2066b\u2067c\u2068d\u2069e")).toBe("abcde");
});

test("length is capped, and the cap is the last thing applied", () => {
    const long = "x".repeat(MAX_LABEL + 50);
    expect(plain(long).length).toBe(MAX_LABEL);
    expect(plain("<".repeat(40) + "y".repeat(MAX_LABEL), MAX_LABEL)).toBe("y".repeat(MAX_LABEL));
    expect(plain("abcdef", 3)).toBe("abc");
});

test("absent text is an empty string, never a crash", () => {
    expect(plain(null)).toBe("");
    expect(plain(undefined)).toBe("");
    expect(plain(0)).toBe("0");
});

test("a monitor id yields the UptimeRobot dashboard URL", () => {
    expect(dashboardUrl(777749809)).toBe("https://dashboard.uptimerobot.com/monitors/777749809");
    expect(dashboardUrl("777749809")).toBe("https://dashboard.uptimerobot.com/monitors/777749809");
});

test("anything that is not a plain decimal id opens nothing", () => {
    expect(dashboardUrl(-1)).toBeNull();
    expect(dashboardUrl(1.5)).toBeNull();
    expect(dashboardUrl("12abc")).toBeNull();
    expect(dashboardUrl("../etc/passwd")).toBeNull();
    expect(dashboardUrl("https://evil.example")).toBeNull();
    expect(dashboardUrl("")).toBeNull();
    expect(dashboardUrl(null)).toBeNull();
});
