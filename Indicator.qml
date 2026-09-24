import QtQuick
import qs.Commons
import qs.Ui

// The bar presence: a quiet green circle while every Monitor is Up, and a red
// circle once something is Down or UptimeRobot itself is Unreachable.
//
// The green circle is there so that "all good" is something you can see rather
// than infer from an empty slot. It is shown only on a confirmed snapshot — while
// connecting, set up, or with anything Degraded, the slot stays empty, because
// a green light that might be stale is the one lie this plugin cannot tell.
//
// Both colors are decided by the Service, grace period included, so the circle
// and the notification never disagree about whether something is wrong.
BarWidget {
    id: root

    property var service: bar && bar.shell ? bar.shell.serviceFor("duckcove.uptimerobot") : null

    readonly property int downCount: service && service.view ? service.view.counts.down : 0
    readonly property bool alerting: service ? service.alerting : false
    readonly property bool healthy: service ? service.healthy : false
    readonly property bool showing: alerting || healthy

    readonly property int slotPadding: Style.space(14)

    implicitWidth: showing ? (vertical ? barSize : content.implicitWidth + slotPadding) : 0
    implicitHeight: showing ? (vertical ? content.implicitHeight + slotPadding : barSize) : 0
    visible: showing

    Grid {
        id: content
        anchors.centerIn: parent
        columns: root.vertical ? 1 : 2
        spacing: Style.spacing.xs
        horizontalItemAlignment: Grid.AlignHCenter
        verticalItemAlignment: Grid.AlignVCenter

        Text {
            text: "\uf111"
            font.family: bar ? bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
            color: root.alerting ? Color.urgent : (root.service ? root.service.okColor : Color.muted)
            textFormat: Text.PlainText
        }

        Text {
            visible: root.alerting && root.downCount > 0
            text: String(root.downCount)
            font.family: bar ? bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
            color: Color.urgent
            textFormat: Text.PlainText
        }
    }

    MouseArea {
        anchors.fill: parent
        enabled: root.showing
        onClicked: if (bar && bar.shell) bar.shell.toggle("duckcove.uptimerobot", "{}")
    }
}
