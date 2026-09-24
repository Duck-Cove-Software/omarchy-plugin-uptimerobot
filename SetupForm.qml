import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "src/connection.js" as Setup

// Connecting, without leaving the pane.
//
// Everything this form needs to do it does through `service`: the API key is
// handed to `authenticate()` and forgotten. The key is never logged and never
// rendered — it exists only as the contents of a masked field, and that field
// is cleared the moment a session exists.
ColumnLayout {
    id: root

    property var service: null
    property var shell: null
    property string moduleName: ""

    property color foreground: Color.menu.text
    property string fontFamily: Style.font.menuFamily
    readonly property color dim: Qt.darker(foreground, 1.4)

    readonly property bool editing: keyField.activeFocus || connectButton.activeFocus

    signal escaped

    readonly property string connection: service ? service.connection : "setup"

    property bool submitting: false
    readonly property bool busy: submitting || connection === "connecting"

    property string problem: ""
    property string problemField: ""

    spacing: Style.space(10)

    readonly property string statusText: {
        if (busy) {
            return "Checking the key with UptimeRobot…";
        }
        if (problem !== "") {
            return problem;
        }
        return "Use a read-only API key. It is stored in your login keyring, never in shell.json.";
    }

    readonly property bool statusIsProblem: !busy && problem !== ""

    function focusFirstField() {
        keyField.forceActiveFocus();
    }

    function reset() {
        keyField.text = "";
        submitting = false;
        problem = "";
        problemField = "";
    }

    function submit() {
        if (!service || busy) {
            return;
        }

        var trouble = Setup.firstProblem({ apiKey: keyField.text });
        if (trouble) {
            problem = trouble.message;
            problemField = trouble.field;
            keyField.forceActiveFocus();
            return;
        }

        problem = "";
        problemField = "";
        submitting = true;
        stallTimer.restart();
        service.authenticate(keyField.text);
    }

    Connections {
        target: root.service

        function onLoginFailed(message) {
            root.submitting = false;
            stallTimer.stop();
            root.problem = message;
            root.problemField = "apiKey";
            keyField.forceActiveFocus();
            keyField.selectAll();
        }

        function onConnectionChanged() {
            if (root.connection === "setup") {
                return;
            }
            root.submitting = false;
            stallTimer.stop();
            keyField.text = "";
            root.problem = "";
            root.problemField = "";
        }
    }

    Timer {
        id: stallTimer
        interval: 45000
        repeat: false
        onTriggered: {
            if (root.submitting) {
                root.submitting = false;
                root.problem = "The login helper did not answer";
                root.problemField = "apiKey";
            }
        }
    }

    PanelSectionHeader {
        Layout.fillWidth: true
        text: "CONNECT TO UPTIMEROBOT"
        foreground: root.foreground
        fontFamily: root.fontFamily
    }

    ColumnLayout {
        Layout.fillWidth: true
        spacing: Style.space(4)

        Text {
            Layout.fillWidth: true
            text: "API key"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            textFormat: Text.PlainText
        }

        TextField {
            id: keyField
            Layout.fillWidth: true
            enabled: !root.busy
            password: true
            placeholderText: "Read-only key from Integrations → API"
            foreground: root.foreground
            accent: root.problemField === "apiKey" ? Color.urgent : Color.accent
            font.family: root.fontFamily
            onAccepted: root.submit()
            Keys.onEscapePressed: function (event) {
                root.escaped();
                event.accepted = true;
            }
        }
    }

    Text {
        Layout.fillWidth: true
        text: root.statusText
        color: root.statusIsProblem ? Color.urgent : root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        wrapMode: Text.WordWrap
        maximumLineCount: 3
        elide: Text.ElideRight
        textFormat: Text.PlainText
    }

    RowLayout {
        Layout.fillWidth: true
        spacing: Style.space(8)

        Item {
            Layout.fillWidth: true
        }

        Button {
            id: connectButton
            text: root.busy ? "Connecting" : "Connect"
            iconText: root.busy ? "\uf021" : ""
            iconSpinning: root.busy
            enabled: !root.busy
            focusable: true
            bordered: true
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.submit()
            Keys.onEscapePressed: function (event) {
                root.escaped();
                event.accepted = true;
            }
        }
    }
}
