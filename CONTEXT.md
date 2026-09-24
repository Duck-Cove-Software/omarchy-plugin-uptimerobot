# UptimeRobot Operator Pane

An Omarchy plugin that surfaces the state of an UptimeRobot account on the
desktop, so that a failing service is noticed and understood without opening a
browser.

## Language

**Monitor**:
A single check UptimeRobot performs against one target on a fixed interval.
_Avoid_: Check, service, host, probe

**Group**:
A named folder of Monitors in UptimeRobot. The primary organising axis of the
pane. A Group's Status is the worst Status among its children.
_Avoid_: Folder, category, section, tag

**Heartbeat**:
The recorded outcome of one execution of a Monitor, reconstructed from
UptimeRobot's logs and response-time samples.
_Avoid_: Beat, ping, result, sample

**Status**:
The condition of a Monitor as of its most recent check. Exactly three values
are shown: Up, Degraded, Down.
_Avoid_: State, health

**Up**:
A Monitor UptimeRobot last confirmed working.
_Avoid_: OK, green, healthy, passing

**Degraded**:
A Monitor that is neither confirmed working nor confirmed failing — it has
not been checked yet, or it seems down and has not exhausted its retries.
_Avoid_: Warning, amber, unstable, flapping

**Down**:
A Monitor UptimeRobot has confirmed failing.
_Avoid_: Failed, red, broken, offline, error

**Paused**:
A Monitor UptimeRobot is not currently checking. It has no Status, is hidden
from the Pane, and can never raise the Indicator.
_Avoid_: Disabled, inactive, off, muted

**Problems**:
The section of the Pane listing every Down Monitor, flattened out of the Group
hierarchy and pinned above it. Empty whenever nothing is Down.
_Avoid_: Alerts, incidents, issues, errors

**Unreachable**:
The condition of having lost contact with UptimeRobot itself. A property of the
connection, never of a Monitor — Monitors do not become unknown, our view of
them does. Must be shown distinctly from Down, because stale data that looks
healthy is the one lie this plugin cannot tell.
_Avoid_: Offline, disconnected, unknown, stale, error

**Pane**:
The on-demand window presenting the full state of the account. Summoned
deliberately; not persistent.
_Avoid_: Dashboard, window, popup, overlay, widget

**Indicator**:
The persistent, minimal presence in the Omarchy bar. A green circle while every
Monitor is Up on a confirmed snapshot; a red circle when something is Down or the
connection is Unreachable; absent otherwise.
_Avoid_: Widget, tray icon, applet, badge

**Notification**:
A desktop toast sent when the Indicator changes color, never while it holds
one: a critical one when a confirmed all-green account starts alerting, a
normal one when it is all green again. Only after green has been seen, so
starting up into an outage sends nothing.
_Avoid_: Alert (as a noun for the toast), alarm, ping, push

## Notes on terms deliberately excluded

**Acknowledge** has no meaning in this context. UptimeRobot has no
acknowledgement primitive in the read path this plugin uses. Do not introduce
the term without deciding what it maps to.
