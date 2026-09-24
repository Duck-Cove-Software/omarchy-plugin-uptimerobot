// What the shell is allowed to render, and what it is allowed to open.
//
// Everything here guards a sink the plugin does not own. `plain()` feeds host
// components that render with AutoText, where the plugin cannot pin
// `textFormat`; `dashboardUrl()` feeds `xdg-open`, where a string becomes a
// program's idea of what to launch.
//
// Both do the same thing with a value they cannot vouch for: refuse it. A
// repaired URL is a URL somebody else chose the shape of, and the point of
// validating at the consumer is that the consumer never guesses.
//
// Pure functions only — no QML, no I/O — so `bun test` and the shell load the
// same file.

/** How many characters a host-rendered label may carry. */
var MAX_LABEL = 120;

/** The widest monitor id UptimeRobot could plausibly have issued. */
var MAX_ID_DIGITS = 12;

/**
 * Characters that must not reach a component rendering with AutoText.
 *
 * `<`, `>` and `&` because Qt sniffs a string for markup and, finding it,
 * renders rich text — and rich text fetches `<img src="...">` from the shell
 * process, to a host the string's author picked.
 *
 * C0, DEL and C1 because a control character in a label is never a label; it
 * is someone reaching past the widget into whatever reads the line after it.
 *
 * The bidi set (U+061C, U+200E/F, U+202A-E, U+2066-9) because those reorder
 * the glyphs around them: a monitor named "robot" plus U+202E plus "gnp.exe"
 * is drawn on screen as "robotexe.png". The text would be honest and the
 * screen would lie.
 */
// no-control-regex exists to catch a control character that got into a pattern
// by accident. Here they are the subject: this is the one regex in the tree
// that is supposed to name them, and the narrow exemption sits on the line
// rather than in eslint.config.js so it cannot quietly cover a second one.
// eslint-disable-next-line no-control-regex
var STRIP = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069<>&]/g;

/**
 * A string safe to hand to a rendering sink the plugin cannot pin.
 *
 * Strips before it caps, deliberately: capping first would let padding decide
 * how much real text survives, and would leave the stripped characters counted
 * against a budget they no longer occupy.
 *
 * @param {*} text anything; `null` and `undefined` are the empty string
 * @param {number} [limit] characters to keep, default `MAX_LABEL`
 * @returns {string} the same text with nothing in it the host can act on
 */
function plain(text, limit) {
    var cap = typeof limit === "number" && isFinite(limit) && limit >= 0 ? limit : MAX_LABEL;
    // Not `String(text || "")`: that turns the id 0 into "" rather than "0".
    var raw = text === null || text === undefined ? "" : String(text);
    var stripped = raw.replace(STRIP, "");
    return stripped.length > cap ? stripped.slice(0, cap) : stripped;
}

/**
 * A monitor id as a path segment, or nothing.
 *
 * Digits and nothing else, so the segment can never be "..", a second path, a
 * query, or a scheme. A float or a non-finite number is not an id either: it
 * is a number that arrived from somewhere that does not issue ids.
 *
 * @param {*} id an `id` from a row
 * @returns {string|null} the id in decimal, or null
 */
function _monitorId(id) {
    if (typeof id === "number") {
        if (!isFinite(id) || Math.floor(id) !== id || id < 0) {
            return null;
        }
        if (String(id).length > MAX_ID_DIGITS) {
            return null;
        }
        return String(id);
    }
    if (typeof id !== "string") {
        return null;
    }
    if (!new RegExp("^[0-9]{1," + MAX_ID_DIGITS + "}$").test(id)) {
        return null;
    }
    return String(Number(id));
}

/**
 * Where a monitor lives in the UptimeRobot web UI.
 *
 * Built from a constant origin and an id this file validated, in that order.
 * Nothing the caller passed is ever concatenated into the result unexamined.
 *
 * @param {*} monitorId the monitor's id
 * @returns {string|null} an absolute https URL, or null — and null means
 *     open nothing, not open something else
 */
function dashboardUrl(monitorId) {
    var id = _monitorId(monitorId);
    if (id === null) {
        return null;
    }
    return "https://dashboard.uptimerobot.com/monitors/" + id;
}

if (typeof module !== "undefined") {
    module.exports = {
        plain: plain,
        dashboardUrl: dashboardUrl,
        MAX_LABEL: MAX_LABEL,
    };
}
