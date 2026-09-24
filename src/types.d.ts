// The shapes the plugin actually handles, named once so the JSDoc in src/ can
// refer to them instead of saying `object` and hoping.
//
// Two vocabularies live here and they are deliberately separate. The `Robot*`
// types are what UptimeRobot puts on the wire — its field names, its status
// codes, its spellings. Everything else is the vocabulary in CONTEXT.md, which
// is what the panel renders. The translation between them happens in model.js,
// and keeping the names apart is what stops the wire format leaking into the UI.

/** A monitor exactly as `getMonitors` sends it. */
interface RobotMonitor {
    id: number;
    friendly_name: string;
    url?: string;
    /** 1 HTTP, 2 keyword, 3 ping, 4 port, 5 heartbeat. */
    type?: number;
    /**
     * 0 paused, 1 not checked yet, 2 up, 8 seems down, 9 down.
     */
    status: number;
    interval?: number;
    /** 0 means ungrouped. */
    monitor_group?: number;
    /** Percentage string for the requested custom window, e.g. `"99.890"`. */
    custom_uptime_ratio?: string | number;
    average_response_time?: string | number;
    ssl?: RobotSsl | null;
    logs?: RobotLog[];
    response_times?: RobotSample[];
    [key: string]: unknown;
}

/** One status-change event from `logs=1`. */
interface RobotLog {
    /** 1 down, 2 up, 98 started, 99 paused. */
    type: number;
    /** Unix time in seconds. */
    datetime: number;
    duration?: number;
    reason?: { code?: string | number; detail?: string } | string;
    [key: string]: unknown;
}

/** One latency sample from `response_times=1`. */
interface RobotSample {
    datetime: number;
    value: number;
}

interface RobotSsl {
    brand?: string;
    product?: string;
    /** Unix time in seconds. */
    expires?: number;
}

/** A monitor group as `/v3/monitor-groups` (or the fallback) names it. */
interface RobotGroup {
    id: number;
    name: string;
}

/** One recorded check outcome, after translation off the wire. */
interface Heartbeat {
    status: string;
    /** Milliseconds since the epoch. */
    timeMs: number | null;
    msg?: string;
    ping?: number | null;
}

/** One monitor, reduced to what the panel shows. */
interface MonitorView {
    id: number;
    name: string;
    status: string;
    statusText: string;
    error: string;
    ping: number | null;
    latencyText: string;
    time: string | null;
    since: string | null;
    held: string;
    uptime24: number | null;
    uptimeText: string;
    avgPing: number | null;
    avgPingText: string;
    certDays: number | null;
    certText: string;
    samples: { status: string; level: number }[];
}

/** A group and the monitors under it, with its worst-child status. */
interface GroupView {
    id: number;
    name: string;
    status: string;
    children: MonitorView[];
}

/** How many monitors are in each state. */
interface ViewCounts {
    up: number;
    degraded: number;
    down: number;
    paused: number;
    total: number;
}

/** Everything the panel renders, derived from the wire shapes. */
interface View {
    groups: GroupView[];
    ungrouped: MonitorView[];
    problems: MonitorView[];
    counts: ViewCounts;
}

/** One line in the flattened list the keyboard moves through. */
interface Row {
    type: "section" | "group" | "monitor";
    id: number | string;
    label: string;
    detail: string;
    /** Indent level: 0 at the top of the list, 1 inside a group. */
    depth: number;
    status: string;
    error: string;
    selectable: boolean;
    monitor: MonitorView | null;
}

/** The connection details the setup form collects. */
interface ConnectionFields {
    apiKey?: string;
}

/** What src/alerts.js is told about the Service after a change. */
interface AlertInput {
    alerting?: boolean;
    healthy?: boolean;
    connection?: string;
    /** Down monitors' names, already passed through Sanitize.plain. */
    downNames?: string[];
    /** Why UptimeRobot is unreachable, already passed through Sanitize.plain. */
    error?: string;
}

/** What to send, if anything, and the state to remember afterwards. */
interface AlertDecision {
    kind: "alert" | "recover" | null;
    urgency: string;
    summary: string;
    body: string;
    next: string;
}
