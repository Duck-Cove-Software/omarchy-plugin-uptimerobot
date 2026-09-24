// When the bar turning red is worth interrupting someone for.
//
// The circle changes color whether or not anyone is looking; a notification is
// for the moment it changes. So this is a transition table, not a status
// display: it speaks once when a confirmed all-green account starts alerting,
// once when it is all green again, and says nothing in between. A second
// monitor going Down while the first is still Down is already on the circle's
// count — telling someone twice that things are bad teaches them to dismiss
// the toast without reading it.
//
// Nothing fires until green has been seen. A shell that starts up with a
// monitor already Down has no "it just broke" to report, and a notification
// at login for an outage the person has been looking at all afternoon is
// noise.
//
// Pure functions only — no QML, no I/O — so `bun test` and the shell load the
// same file. Names arrive already passed through Sanitize.plain: the
// notification daemon renders bodies as markup.

/** Names spelled out in a Down notification before the rest become a count. */
var MAX_NAMES = 3;

/**
 * What to say, if anything, now that the Service's state has moved.
 *
 * @param {string} prev "unknown", "green" or "alerted" — what was last settled
 * @param {AlertInput} input `{alerting, healthy, connection, downNames, error}`
 * @returns {AlertDecision} `{kind, urgency, summary, body, next}`; `kind` is
 *     null when nothing should be sent, and `next` is always the state to keep
 */
function nextNotification(prev, input) {
    var state = input || {};
    var quiet = { kind: null, urgency: "", summary: "", body: "", next: prev || "unknown" };
    if (state.healthy) {
        if (prev === "alerted") {
            return {
                kind: "recover",
                urgency: "normal",
                summary: "UptimeRobot: all monitors up",
                body: "Everything UptimeRobot checks is Up again.",
                next: "green",
            };
        }
        quiet.next = "green";
        return quiet;
    }
    if (state.alerting && prev === "green") {
        /** @type {AlertDecision} */
        var alert = { kind: "alert", urgency: "critical", summary: "", body: "", next: "alerted" };
        if (state.connection === "unreachable") {
            alert.summary = "UptimeRobot unreachable";
            alert.body = state.error
                ? "Cannot reach UptimeRobot — " + state.error
                : "Cannot reach UptimeRobot";
        } else {
            alert.summary = "UptimeRobot: monitor down";
            alert.body = downText(state.downNames || []);
        }
        return alert;
    }
    return quiet;
}

/**
 * "2 down: api, web" — the first few names, then how many more.
 *
 * @param {string[]} names the Down monitors' names, already safe to render
 * @returns {string} one line
 */
function downText(names) {
    var shown = names.slice(0, MAX_NAMES).join(", ");
    var rest = names.length - MAX_NAMES;
    return names.length + " down: " + shown + (rest > 0 ? " +" + rest + " more" : "");
}

if (typeof module !== "undefined") {
    module.exports = {
        nextNotification: nextNotification,
        downText: downText,
        MAX_NAMES: MAX_NAMES,
    };
}
