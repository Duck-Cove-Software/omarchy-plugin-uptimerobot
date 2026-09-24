// What the setup form knows about the shape of a connection, before anything
// is sent anywhere. Pure functions only — no QML, no I/O — so the rules the
// form enforces can be read and tested without a running shell.
//
// Nothing here ever touches the key beyond asking whether one was typed: an
// API key is whatever the person typed, including spaces, and this file has
// no business normalising it beyond trimming the ends they did not mean.

/**
 * The first thing wrong with the form, read top to bottom as the person sees it.
 *
 * @param {ConnectionFields} fields `{apiKey}`
 * @returns {object|null} `{field, message}`, or null when the form is ready to send
 */
function firstProblem(fields) {
    var form = fields || {};
    // Trimmed only to decide emptiness: a key of spaces is not a key, and the
    // form should say so before a round trip that will refuse it anyway.
    if (String(form.apiKey || "").trim() === "") {
        return { field: "apiKey", message: "Enter your UptimeRobot API key" };
    }
    return null;
}

if (typeof module !== "undefined") {
    module.exports = {
        firstProblem: firstProblem,
    };
}
