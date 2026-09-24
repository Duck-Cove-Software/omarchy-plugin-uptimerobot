import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "src/model.js" as Model
import "src/alerts.js" as Alerts
import "src/sanitize.js" as Sanitize

// Owns the one connection to UptimeRobot and the state derived from it.
//
// Mounted for the life of the shell, because the Indicator's job is to be
// right when nobody is looking at it. The Indicator and the Pane read from
// here; neither of them talks to UptimeRobot itself.
Item {
    id: root

    property string omarchyPath: ""
    property var shell: null
    property var manifest: null

    // "setup" — nothing configured yet, or the stored key was refused
    // "connecting" — a snapshot is being fetched
    // "connected" — the snapshot has arrived
    // "unreachable" — we had a snapshot and lost it; what we show is now stale
    property string connection: "setup"
    property string lastError: ""
    property double lastUpdate: 0

    readonly property bool configured: _apiKey !== ""

    property var view: Model.buildView([], [])

    // Whether the bar should be red, and whether it should be green. They live
    // here rather than in the Indicator because the notification rides on
    // them, and a notification has to fire whether or not the widget is in
    // the bar at all.
    //
    // Down and Unreachable both wait out a grace period before they count: a
    // monitor that flaps for one poll, or a network that drops for a moment,
    // is not worth turning the bar red for, let alone interrupting someone.
    readonly property bool wantsAttention: view.counts.down > 0 || connection === "unreachable"
    readonly property bool alerting: _armed && wantsAttention
    // Only on a confirmed snapshot: a green light that might be stale is the
    // one lie this plugin cannot tell.
    readonly property bool healthy: connection === "connected" && view.counts.total > 0 && view.counts.up === view.counts.total

    property string _apiKey: ""
    property string _pendingKey: ""
    property int _backoffMs: 1000
    property bool _demo: false
    property bool _armed: false
    // What src/alerts.js last settled on: "unknown", "green" or "alerted".
    property string _notifyState: "unknown"

    readonly property int _themeMaxBytes: 65536
    readonly property int _keyMaxChars: 8192
    readonly property int _replyMaxChars: 65536
    readonly property int _payloadMaxChars: 4000000
    readonly property int _demoMaxBytes: 524288
    readonly property int _pollSeconds: 60

    readonly property string _pluginDir: Qt.resolvedUrl(".").toString().replace("file://", "")

    property color okColor: Color.muted

    FileView {
        id: themeWatcher
        path: Color.currentThemePath + "/colors.toml"
        watchChanges: true
        preload: false
        blockAllReads: true
        printErrors: false
        onFileChanged: themeProc.running = true
    }

    BoundedProcess {
        id: themeProc
        maxBytes: root._themeMaxBytes
        deadlineSeconds: 10
        program: [root._pluginDir + "bin/read-bounded.sh", themeWatcher.path, String(root._themeMaxBytes)]
        onFinishedWith: function (text, tooLarge) {
            if (tooLarge || text.length === 0) {
                root.okColor = Color.muted;
                return;
            }
            var match = /^[ \t]*green[ \t]*=[ \t]*["']?(#[0-9A-Fa-f]{6})/m.exec(text);
            root.okColor = match ? match[1] : Color.muted;
        }
    }

    function _evaluateAttention() {
        if (!wantsAttention) {
            graceTimer.stop();
            _armed = false;
        } else if (!_armed && !graceTimer.running) {
            graceTimer.restart();
        }
    }

    onWantsAttentionChanged: _evaluateAttention()

    Timer {
        id: graceTimer
        interval: 30000
        repeat: false
        onTriggered: if (root.wantsAttention) root._armed = true
    }

    // Both can move on one snapshot — red clearing and green arriving — so the
    // decision waits until the change has settled rather than seeing half of it.
    onAlertingChanged: Qt.callLater(_notifyIfChanged)
    onHealthyChanged: Qt.callLater(_notifyIfChanged)

    function _notifyIfChanged() {
        if (_demo) {
            return;
        }
        var downNames = [];
        for (var i = 0; i < view.problems.length; i++) {
            if (view.problems[i].status === "down") {
                downNames.push(Sanitize.plain(view.problems[i].name));
            }
        }
        var decision = Alerts.nextNotification(_notifyState, {
            alerting: alerting,
            healthy: healthy,
            connection: connection,
            downNames: downNames,
            error: Sanitize.plain(lastError),
        });
        _notifyState = decision.next;
        if (decision.kind !== null) {
            _notify(decision.urgency, decision.summary, decision.body);
        }
    }

    // One process per notification. `--action` makes notify-send wait until
    // the toast is clicked or dismissed — for a critical one, that can be
    // hours — so a shared process would have the recovery cancel the alert's
    // click handler. Each one cleans itself up when its toast goes away.
    function _notify(urgency, summary, body) {
        var proc = notifyComponent.createObject(root, {
            program: [
                "/usr/bin/notify-send",
                "--app-name=UptimeRobot",
                "--urgency=" + urgency,
                "--action=default=Open",
                summary,
                body,
            ],
        });
        if (proc) {
            proc.running = true;
        }
    }

    Component {
        id: notifyComponent

        BoundedProcess {
            id: notifyProc
            maxBytes: 4096
            // No deadline: the toast is on screen until the person deals with it.
            deadlineSeconds: 0
            onFinishedWith: function (text, tooLarge) {
                if (!tooLarge && text.trim() === "default" && root.shell) {
                    root.shell.toggle("duckcove.uptimerobot", "{}");
                }
                notifyProc.destroy();
            }
        }
    }

    signal loginFailed(string message)

    Component.onCompleted: {
        readKey();
        themeProc.running = true;
    }

    function start() {
        if (_apiKey === "" || _demo) {
            return;
        }
        if (pollProc.running) {
            return;
        }
        if (connection === "setup") {
            connection = "connecting";
        }
        pollProc.stdinEnabled = true;
        pollProc.running = true;
    }

    function stop() {
        if (pollProc.running) {
            pollProc.signal(15);
            pollKillTimer.restart();
        }
        pollProc.running = false;
        retryTimer.stop();
        pollTimer.stop();
    }

    Timer {
        id: pollKillTimer
        interval: 6000
        repeat: false
        onTriggered: if (pollProc.running) pollProc.signal(9)
    }

    Timer {
        id: pollTimer
        interval: root._pollSeconds * 1000
        repeat: true
        onTriggered: root.start()
    }

    Component.onDestruction: {
        pollProc.running = false;
    }

    function forget() {
        stop();
        _apiKey = "";
        connection = "setup";
        _notifyState = "unknown";
        view = Model.buildView([], []);
        forgetProc.running = true;
    }

    function readKey() {
        keyProc.running = true;
    }

    BoundedProcess {
        id: keyProc
        maxBytes: root._keyMaxChars
        deadlineSeconds: 20
        program: [
            "/usr/bin/secret-tool",
            "lookup",
            "service",
            "duckcove.uptimerobot",
            "account",
            "api-key",
        ]
        onFinishedWith: function (text, tooLarge) {
            var value = tooLarge ? "" : text.trim();
            if (value === "") {
                root.connection = "setup";
                return;
            }
            root._apiKey = value;
            root.start();
        }
    }

    BoundedProcess {
        id: forgetProc
        maxBytes: 4096
        deadlineSeconds: 20
        program: [
            "/usr/bin/secret-tool",
            "clear",
            "service",
            "duckcove.uptimerobot",
            "account",
            "api-key",
        ]
    }

    function authenticate(apiKey) {
        root._pendingKey = apiKey;
        verifyProc.payload = JSON.stringify({ apiKey: apiKey });
        verifyProc.stdinEnabled = true;
        verifyProc.running = true;
    }

    BoundedProcess {
        id: verifyProc
        maxBytes: root._replyMaxChars
        deadlineSeconds: 30
        property string payload: ""
        program: [root._pluginDir + "bin/verify.sh"]
        stdinEnabled: true
        onStarted: {
            write(payload + "\n");
            payload = "";
            stdinEnabled = false;
        }
        onFinishedWith: function (text, tooLarge) {
            var result = {};
            try {
                if (tooLarge) {
                    throw new Error("oversized reply");
                }
                result = JSON.parse(text);
            } catch (e) {
                result = { ok: false, error: "Unreadable answer from the login helper" };
            }
            if (result.ok && root._pendingKey !== "") {
                var key = root._pendingKey;
                root._pendingKey = "";
                root.acceptKey(key);
                return;
            }
            root._pendingKey = "";
            root.lastError = result.error || "That API key was refused";
            root.loginFailed(root.lastError);
        }
    }

    function acceptKey(apiKey) {
        root._apiKey = apiKey;
        storeProc.secret = apiKey;
        storeProc.running = true;
        root.start();
    }

    BoundedProcess {
        id: storeProc
        maxBytes: 4096
        deadlineSeconds: 20
        property string secret: ""
        program: [
            "/usr/bin/secret-tool",
            "store",
            "--label=UptimeRobot API key (duckcove.uptimerobot)",
            "service",
            "duckcove.uptimerobot",
            "account",
            "api-key",
        ]
        stdinEnabled: true
        onStarted: {
            write(secret + "\n");
            secret = "";
            stdinEnabled = false;
        }
    }

    BoundedProcess {
        id: pollProc
        maxBytes: root._payloadMaxChars
        deadlineSeconds: 45
        program: [root._pluginDir + "bin/poll.sh"]
        stdinEnabled: true
        onStarted: {
            write(JSON.stringify({ apiKey: root._apiKey }) + "\n");
            stdinEnabled = false;
        }
        onFinishedWith: function (text, tooLarge) {
            if (root._demo || root.connection === "setup") {
                return;
            }
            var exitCode = pollProc.lastExitCode;
            if (exitCode === 2) {
                root.lastError = "That API key was refused — sign in again";
                root.forget();
                return;
            }
            if (tooLarge) {
                root.lastError = "Ignored an oversized response from UptimeRobot";
                root._fail();
                return;
            }
            var snapshot = null;
            try {
                snapshot = JSON.parse(text);
            } catch (e) {
                snapshot = null;
            }
            if (exitCode === 0 && snapshot && Array.isArray(snapshot.monitors)) {
                root._backoffMs = 1000;
                root.connection = "connected";
                root.lastUpdate = Date.now();
                root.lastError = "";
                root.view = Model.buildView(snapshot.monitors, snapshot.groups || [], Date.now());
                pollTimer.start();
                return;
            }
            if (root.lastError === "") {
                root.lastError = pollProc.stderrTail.trim() || "Cannot reach UptimeRobot";
            }
            root._fail();
        }
    }

    function _fail() {
        if (root.connection === "setup") {
            return;
        }
        root.connection = "unreachable";
        pollTimer.stop();
        retryTimer.interval = root._backoffMs;
        retryTimer.start();
        root._backoffMs = Math.min(root._backoffMs * 2, 60000);
    }

    function _rebase(monitors) {
        var newest = 0;
        var i;
        var j;
        for (i = 0; i < monitors.length; i++) {
            var times = monitors[i].response_times || [];
            for (j = 0; j < times.length; j++) {
                if (typeof times[j].datetime === "number") {
                    newest = Math.max(newest, times[j].datetime);
                }
            }
            var logs = monitors[i].logs || [];
            for (j = 0; j < logs.length; j++) {
                if (typeof logs[j].datetime === "number") {
                    newest = Math.max(newest, logs[j].datetime);
                }
            }
        }
        if (!newest) {
            return monitors;
        }
        var now = Math.floor(Date.now() / 1000);
        var delta = now - newest;
        for (i = 0; i < monitors.length; i++) {
            var shiftedTimes = monitors[i].response_times || [];
            for (j = 0; j < shiftedTimes.length; j++) {
                shiftedTimes[j].datetime += delta;
            }
            var shiftedLogs = monitors[i].logs || [];
            for (j = 0; j < shiftedLogs.length; j++) {
                shiftedLogs[j].datetime += delta;
            }
            if (monitors[i].ssl && typeof monitors[i].ssl.expires === "number") {
                monitors[i].ssl.expires += delta;
            }
        }
        return monitors;
    }

    BoundedProcess {
        id: demoProc
        maxBytes: root._demoMaxBytes
        deadlineSeconds: 10
        program: [
            root._pluginDir + "bin/read-bounded.sh",
            root._pluginDir + "demo/snapshot.json",
            String(root._demoMaxBytes),
        ]
        onFinishedWith: function (text, tooLarge) {
            if (tooLarge || text.length === 0) {
                root.lastError = "Could not read the demo snapshot";
                return;
            }
            var snapshot;
            try {
                snapshot = JSON.parse(text);
            } catch (e) {
                root.lastError = "The demo snapshot is not readable JSON";
                return;
            }
            var monitors = root._rebase(snapshot.monitors || []);
            root.connection = "connected";
            root.lastUpdate = Date.now();
            root.view = Model.buildView(monitors, snapshot.groups || [], Date.now());
        }
    }

    Timer {
        id: retryTimer
        repeat: false
        onTriggered: if (!root._demo && root._apiKey !== "") root.start()
    }

    IpcHandler {
        target: "duckcove.uptimerobot.service"

        function refresh(): void {
            root.stop();
            root.start();
        }

        function status(): string {
            return root.connection;
        }

        function demo(): void {
            root._demo = true;
            root._notifyState = "unknown";
            root.stop();
            demoProc.running = true;
        }
    }
}
