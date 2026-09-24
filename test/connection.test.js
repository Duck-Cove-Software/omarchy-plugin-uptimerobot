import { test, expect } from "bun:test";
import { firstProblem } from "../src/connection.js";

test("an empty key is the first thing to fix", () => {
    expect(firstProblem({ apiKey: "" })).toEqual({
        field: "apiKey",
        message: "Enter your UptimeRobot API key",
    });
    expect(firstProblem({ apiKey: "   " })).toEqual({
        field: "apiKey",
        message: "Enter your UptimeRobot API key",
    });
    expect(firstProblem({})).toEqual({
        field: "apiKey",
        message: "Enter your UptimeRobot API key",
    });
});

test("a typed key is enough to send", () => {
    expect(firstProblem({ apiKey: "u1234567-abcdefghijklmnopqrstuvwxyz" })).toBe(null);
});
