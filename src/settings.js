// The two timings a person can tune from shell.json, and the bounds on them.
//
// A value that is missing, not a whole number, or out of range falls back or
// is clamped here rather than reaching a Timer: a poll interval of 0 would
// spend the free plan's 10 requests a minute in the first second, and a
// negative grace period means nothing.
//
// Pure functions only — no QML, no I/O — so `bun test` and the shell load the
// same file.

/** Seconds between polls when nothing is configured. */
var POLL_DEFAULT = 20;

/**
 * The shortest poll interval allowed.
 *
 * Each poll is one request for the monitor groups plus one per 50 monitors.
 * At 15 seconds that is 8 requests a minute for an account of up to 50
 * monitors, inside the free plan's limit of 10.
 */
var POLL_MIN = 15;

var POLL_MAX = 3600;

/** Seconds something must stay Down or Unreachable before it counts. */
var GRACE_DEFAULT = 0;

var GRACE_MAX = 600;

/**
 * A whole number of seconds within [min, max], or the fallback.
 *
 * @param {*} value whatever shell.json held
 * @param {number} fallback used when value is not a finite number
 * @param {number} min lowest value allowed
 * @param {number} max highest value allowed
 * @returns {number} a whole number of seconds
 */
function _seconds(value, fallback, min, max) {
    var n =
        typeof value === "number"
            ? value
            : typeof value === "string" && value.trim() !== ""
              ? Number(value)
              : NaN;
    if (!isFinite(n)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * The poll interval to use.
 *
 * @param {*} value the `pollSeconds` setting
 * @returns {number} seconds, between POLL_MIN and POLL_MAX
 */
function pollSeconds(value) {
    return _seconds(value, POLL_DEFAULT, POLL_MIN, POLL_MAX);
}

/**
 * The grace period to use.
 *
 * @param {*} value the `graceSeconds` setting
 * @returns {number} seconds, between 0 and GRACE_MAX
 */
function graceSeconds(value) {
    return _seconds(value, GRACE_DEFAULT, 0, GRACE_MAX);
}

if (typeof module !== "undefined") {
    module.exports = {
        pollSeconds: pollSeconds,
        graceSeconds: graceSeconds,
        POLL_DEFAULT: POLL_DEFAULT,
        POLL_MIN: POLL_MIN,
        POLL_MAX: POLL_MAX,
        GRACE_DEFAULT: GRACE_DEFAULT,
        GRACE_MAX: GRACE_MAX,
    };
}
