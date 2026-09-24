// The domain model: UptimeRobot's wire shapes turned into the vocabulary in
// CONTEXT.md. Pure functions only — no QML, no I/O — so the test runner and the
// shell can load the same file.

/** Monitor status codes as UptimeRobot records them. */
var STATUS_PAUSED = 0;
var STATUS_NOT_CHECKED = 1;
var STATUS_UP = 2;
var STATUS_SEEMS_DOWN = 8;
var STATUS_DOWN = 9;

/** Log types as `logs=1` records them. */
var LOG_DOWN = 1;
var LOG_UP = 2;
var LOG_STARTED = 98;

/** Status values, worst first. Order is the severity ordering. */
var SEVERITY = ["down", "degraded", "up"];

/**
 * Whether UptimeRobot is currently checking this monitor at all.
 *
 * @param {RobotMonitor} monitor a monitor as it appears in `getMonitors`
 * @returns {boolean} true when the monitor is Paused
 */
function isPaused(monitor) {
    return Number(monitor && monitor.status) === STATUS_PAUSED;
}

/**
 * The Status of a monitor, given the code UptimeRobot last recorded.
 *
 * A monitor that has never been checked is Degraded: it is not confirmed
 * working, and calling it Up would be a guess in the direction that hides
 * problems. "Seems down" is the same: retries are still in flight.
 *
 * @param {RobotMonitor} monitor a monitor as it appears in `getMonitors`
 * @returns {string} "up", "degraded" or "down"
 */
function statusOf(monitor) {
    var code = Number(monitor && monitor.status);
    if (code === STATUS_UP) {
        return "up";
    }
    if (code === STATUS_DOWN) {
        return "down";
    }
    if (code === STATUS_SEEMS_DOWN || code === STATUS_NOT_CHECKED) {
        return "degraded";
    }
    return "degraded";
}

/**
 * The Status a log entry records, or null when it is not a status change we
 * render (paused, started-as-noise, unknown).
 *
 * @param {RobotLog} log one `logs` entry
 * @returns {string|null} "up", "down", or null
 */
function statusOfLog(log) {
    var code = Number(log && log.type);
    if (code === LOG_DOWN) {
        return "down";
    }
    if (code === LOG_UP || code === LOG_STARTED) {
        return "up";
    }
    return null;
}

/**
 * The worst Status in a collection — how a Group reports its children.
 *
 * Nothing at all is Up: an empty Group is not a problem, and must not raise the
 * Indicator.
 *
 * @param {string[]} statuses statuses to reduce
 * @returns {string} the worst of them
 */
function worstStatus(statuses) {
    for (var i = 0; i < SEVERITY.length; i++) {
        if (statuses.indexOf(SEVERITY[i]) !== -1) {
            return SEVERITY[i];
        }
    }
    return "up";
}

/**
 * Order by name, case-insensitively and ignoring stray surrounding whitespace.
 *
 * Position should be a property of what a thing is called, not of how it was
 * typed or when it was created.
 *
 * @param {Array<{name: string}>} items anything carrying a `name`
 * @returns {Array} the same items, ordered
 */
function byName(items) {
    return items.slice().sort(function (a, b) {
        var left = String(a.name || "")
            .trim()
            .toLowerCase();
        var right = String(b.name || "")
            .trim()
            .toLowerCase();
        if (left < right) {
            return -1;
        }
        if (left > right) {
            return 1;
        }
        return 0;
    });
}

/** How Status is written when it is shown as a word rather than a colour. */
var STATUS_LABEL = { up: "Up", degraded: "Degraded", down: "Down" };

/** How many response-time samples the sparkline draws. */
var WINDOW = 50;

/**
 * Unix seconds, or a value that is already milliseconds, as epoch ms.
 *
 * @param {number|null|undefined} value a timestamp
 * @returns {number|null}
 */
function toMs(value) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
        return null;
    }
    // UptimeRobot's logs and samples are Unix seconds. A value already in ms
    // is larger than any plausible Unix-seconds timestamp we will see.
    return value > 1e12 ? value : value * 1000;
}

/**
 * An elapsed span, in the largest two units that still carry information.
 *
 * Seconds stop mattering once there are minutes of them, and minutes once
 * there are days: an outage is triaged by its order of magnitude.
 *
 * @param {number} ms the span
 * @returns {string} e.g. "42s", "9m", "3h 11m", "2d 5h"
 */
function formatDuration(ms) {
    var seconds = Math.max(0, Math.floor((ms || 0) / 1000));
    if (seconds < 60) {
        return seconds + "s";
    }
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return minutes + "m";
    }
    var hours = Math.floor(minutes / 60);
    if (hours < 24) {
        var restMinutes = minutes % 60;
        return restMinutes === 0 ? hours + "h" : hours + "h " + restMinutes + "m";
    }
    var days = Math.floor(hours / 24);
    var restHours = hours % 24;
    return restHours === 0 ? days + "d" : days + "d " + restHours + "h";
}

/**
 * Logs ordered oldest first, so walking them matches a heartbeat history.
 *
 * @param {RobotLog[]|null|undefined} logs
 * @returns {RobotLog[]}
 */
function orderedLogs(logs) {
    return (logs || []).slice().sort(function (a, b) {
        return Number(a.datetime || 0) - Number(b.datetime || 0);
    });
}

/**
 * When the Status a monitor holds now began.
 *
 * Walks back from the newest status-changing log while the Status it reports
 * is unchanged. "Seems down" is Degraded on the wire and Down in the logs;
 * walking Down logs for a Degraded monitor is how a retrying check still
 * shows how long it has been in trouble.
 *
 * @param {RobotMonitor} monitor a monitor as it appears in `getMonitors`
 * @param {RobotLog[]} logs its logs, any order
 * @returns {number|null} epoch milliseconds, or null if unknown
 */
function statusSinceMs(monitor, logs) {
    var history = orderedLogs(logs);
    if (history.length === 0) {
        return null;
    }
    var current = statusOf(monitor);
    var wanted = current === "degraded" ? "down" : current;
    var earliest = null;
    for (var i = history.length - 1; i >= 0; i--) {
        var logged = statusOfLog(history[i]);
        if (logged === null) {
            continue;
        }
        if (logged !== wanted) {
            break;
        }
        earliest = history[i];
    }
    return earliest ? toMs(earliest.datetime) : null;
}

/**
 * How long the current Status has held, phrased for the line it sits on.
 *
 * @param {RobotMonitor} monitor a monitor as it appears in `getMonitors`
 * @param {RobotLog[]} logs its logs
 * @param {number} nowMs the current time
 * @returns {string} e.g. "for 3h 11m", or "" if unknown
 */
function heldText(monitor, logs, nowMs) {
    var since = statusSinceMs(monitor, logs);
    if (since === null) {
        return "";
    }
    return "for " + formatDuration(nowMs - since);
}

/**
 * An uptime ratio as a percentage, keeping only the digits that differ.
 *
 * UptimeRobot reports a 0–100 percentage. Two decimals is where the figures
 * stop being noise, and a whole number keeps no decimals at all: "95%" reads
 * faster than "95.00%".
 *
 * @param {number|null} percent 0–100
 * @returns {string} e.g. "99.87%", or "" when nothing has been reported
 */
function formatPercent(percent) {
    if (typeof percent !== "number" || isNaN(percent)) {
        return "";
    }
    return Math.round(percent * 100) / 100 + "%";
}

/**
 * A latency in whole milliseconds.
 *
 * @param {number|null} ms a sample, or an average
 * @returns {string} e.g. "12 ms", or "" when nothing was measured
 */
function formatLatency(ms) {
    if (typeof ms !== "number" || isNaN(ms)) {
        return "";
    }
    return Math.round(ms) + " ms";
}

/**
 * What a certificate has left, said plainly.
 *
 * @param {number|null} days days remaining
 * @returns {string} e.g. "21 days", "expired", or "" when there is no
 *     certificate to speak of
 */
function formatCertDays(days) {
    if (typeof days !== "number" || isNaN(days)) {
        return "";
    }
    if (days <= 0) {
        return "expired";
    }
    return days === 1 ? "1 day" : days + " days";
}

/**
 * A number UptimeRobot may have sent as a string.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function asNumber(value) {
    if (typeof value === "number" && isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        var n = Number(value);
        return isFinite(n) ? n : null;
    }
    return null;
}

/**
 * The error text of a failure, taken from the newest down log.
 *
 * @param {RobotLog[]} logs
 * @returns {string}
 */
function errorOf(logs) {
    var history = orderedLogs(logs);
    for (var i = history.length - 1; i >= 0; i--) {
        if (statusOfLog(history[i]) !== "down") {
            continue;
        }
        var reason = history[i].reason;
        if (typeof reason === "string" && reason.trim() !== "") {
            return reason;
        }
        if (reason && typeof reason === "object") {
            var detail = reason.detail;
            if (typeof detail === "string" && detail.trim() !== "") {
                return detail;
            }
        }
    }
    return "";
}

/**
 * Recent response times reduced to what a sparkline draws.
 *
 * Height is latency against the slowest check in the window, so a service
 * getting steadily worse shows it before it fails. A current failure is drawn
 * as a full-height bar at the end, so the eye lands on the gap.
 *
 * @param {RobotMonitor} monitor a monitor as it appears in `getMonitors`
 * @returns {Array} `{status, level}` per sample, oldest first, at most 50
 */
function sparkline(monitor) {
    var samplesIn = (monitor.response_times || []).slice().sort(function (a, b) {
        return Number(a.datetime || 0) - Number(b.datetime || 0);
    });
    if (samplesIn.length > WINDOW) {
        samplesIn = samplesIn.slice(samplesIn.length - WINDOW);
    }

    var history = [];
    var i;
    for (i = 0; i < samplesIn.length; i++) {
        var ping = asNumber(samplesIn[i].value);
        history.push({
            status: "up",
            ping: ping,
        });
    }
    if (statusOf(monitor) === "down") {
        history.push({ status: "down", ping: null });
        if (history.length > WINDOW) {
            history = history.slice(history.length - WINDOW);
        }
    }

    var slowest = 0;
    for (i = 0; i < history.length; i++) {
        if (typeof history[i].ping === "number" && history[i].ping > slowest) {
            slowest = history[i].ping;
        }
    }

    var samples = [];
    for (i = 0; i < history.length; i++) {
        var status = history[i].status;
        var level;
        if (status === "down") {
            level = 1;
        } else if (typeof history[i].ping === "number" && slowest > 0) {
            level = Math.round((0.15 + 0.85 * (history[i].ping / slowest)) * 1000) / 1000;
        } else {
            level = 0.35;
        }
        samples.push({ status: status, level: level });
    }
    return samples;
}

/**
 * Days remaining on the leaf certificate, if UptimeRobot reported an expiry.
 *
 * @param {RobotMonitor} monitor
 * @param {number} nowMs
 * @returns {number|null}
 */
function certDaysOf(monitor, nowMs) {
    var ssl = monitor && monitor.ssl;
    var expires = ssl ? toMs(ssl.expires) : null;
    if (expires === null) {
        return null;
    }
    return Math.floor((expires - nowMs) / 86400000);
}

/**
 * One monitor, reduced to what the Pane renders.
 *
 * Everything the detail view shows is derived here rather than there: the
 * Pane owns no arithmetic, and every line of this is testable without a shell.
 *
 * @param {RobotMonitor} monitor a monitor as it appears in `getMonitors`
 * @param {number} nowMs the current time
 * @returns {MonitorView} the row
 */
function toRow(monitor, nowMs) {
    var logs = monitor.logs || [];
    var status = statusOf(monitor);
    var times = (monitor.response_times || []).slice().sort(function (a, b) {
        return Number(a.datetime || 0) - Number(b.datetime || 0);
    });
    var lastSample = times.length ? times[times.length - 1] : null;
    var ping = lastSample ? asNumber(lastSample.value) : null;
    var uptime24 = asNumber(monitor.custom_uptime_ratio);
    var avgPing = asNumber(monitor.average_response_time);
    var certDays = certDaysOf(monitor, nowMs);
    var since = statusSinceMs(monitor, logs);
    return {
        id: monitor.id,
        name: monitor.friendly_name,
        status: status,
        statusText: STATUS_LABEL[status],
        error: status === "down" || status === "degraded" ? errorOf(logs) : "",
        ping: ping,
        latencyText: formatLatency(ping),
        time: lastSample && lastSample.datetime ? String(lastSample.datetime) : null,
        since: since === null ? null : String(since),
        held: heldText(monitor, logs, nowMs),
        uptime24: uptime24,
        uptimeText: formatPercent(uptime24),
        avgPing: avgPing,
        avgPingText: formatLatency(avgPing),
        certDays: certDays,
        certText: formatCertDays(certDays),
        samples: sparkline(monitor),
    };
}

/**
 * Turn a `getMonitors` list and its groups into the shape the Pane shows.
 *
 * Paused monitors are dropped from the tree entirely and survive only as a
 * count: UptimeRobot is not checking them, so they have nothing to report and
 * would only dilute a view whose job is finding the broken ones.
 *
 * @param {RobotMonitor[]} monitors monitors as UptimeRobot sends them
 * @param {RobotGroup[]} groupList named groups, if any
 * @param {number} nowMs the current time, against which ages are measured
 * @returns {View} `{groups, ungrouped, problems, counts}`
 */
function buildView(monitors, groupList, nowMs) {
    var all = monitors || [];
    var named = groupList || [];
    var now = typeof nowMs === "number" ? nowMs : Date.now();

    var live = [];
    var pausedCount = 0;
    var i;
    for (i = 0; i < all.length; i++) {
        if (isPaused(all[i])) {
            pausedCount++;
        } else {
            live.push(all[i]);
        }
    }

    var groupById = {};
    var groups = [];
    for (i = 0; i < named.length; i++) {
        var g = named[i];
        if (!g || g.id === undefined || g.id === null || Number(g.id) === 0) {
            continue;
        }
        var group = {
            id: g.id,
            name: g.name || "Group " + g.id,
            status: "up",
            children: [],
        };
        groups.push(group);
        groupById[String(g.id)] = group;
    }

    for (i = 0; i < live.length; i++) {
        var parentId = Number(live[i].monitor_group || 0);
        if (parentId && !groupById[String(parentId)]) {
            var fallback = {
                id: parentId,
                name: "Group " + parentId,
                status: "up",
                children: [],
            };
            groups.push(fallback);
            groupById[String(parentId)] = fallback;
        }
    }

    var ungrouped = [];
    var problems = [];
    var counts = { up: 0, degraded: 0, down: 0, paused: pausedCount, total: 0 };

    for (i = 0; i < live.length; i++) {
        var row = toRow(live[i], now);
        counts[row.status]++;
        counts.total++;
        if (row.status === "down") {
            problems.push(row);
        }
        var parent = Number(live[i].monitor_group || 0);
        if (parent && groupById[String(parent)]) {
            groupById[String(parent)].children.push(row);
        } else {
            ungrouped.push(row);
        }
    }

    var kept = [];
    for (i = 0; i < groups.length; i++) {
        groups[i].status = worstStatus(
            groups[i].children.map(function (child) {
                return child.status;
            }),
        );
        groups[i].children = byName(groups[i].children);
        if (groups[i].children.length > 0) {
            kept.push(groups[i]);
        }
    }

    return {
        groups: byName(kept),
        ungrouped: byName(ungrouped),
        problems: byName(problems),
        counts: counts,
    };
}

if (typeof module !== "undefined") {
    module.exports = {
        isPaused: isPaused,
        statusOf: statusOf,
        statusOfLog: statusOfLog,
        worstStatus: worstStatus,
        buildView: buildView,
        toRow: toRow,
        formatDuration: formatDuration,
        formatPercent: formatPercent,
        formatLatency: formatLatency,
        formatCertDays: formatCertDays,
        statusSinceMs: statusSinceMs,
        heldText: heldText,
        sparkline: sparkline,
        errorOf: errorOf,
        asNumber: asNumber,
        toMs: toMs,
    };
}
