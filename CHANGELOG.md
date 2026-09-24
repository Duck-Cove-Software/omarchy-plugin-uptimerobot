# Changelog

## Unreleased

- Fix clicking a monitor in the Pane doing nothing: it passed `--` to `xdg-open`, which rejects it as an unknown option. It now opens the monitor on the UptimeRobot dashboard.
- Send a desktop notification when the account goes from all green to alerting (a monitor Down, or UptimeRobot Unreachable, after the 30s grace), and a quiet one when it is all green again. The alert is critical, so it stays until dismissed; clicking it opens the Pane.
- The bar indicator now shows a green circle while every monitor is Up, instead of staying hidden, and a red circle (with the Down count) when something is Down or UptimeRobot is Unreachable.
- Fix the service reporting UptimeRobot as unreachable after every successful poll: it read an `exitCode` property that Quickshell's `Process` does not have.
- Fix monitor groups always coming back empty: the v3 API wants a Bearer token, not basic auth.
- Fix `bin/authenticate.sh` always rejecting the key: it sent `verify.sh` multi-line JSON, which reads only the first line.

## 1.0.0

- Operator view of an UptimeRobot account for Omarchy 4.x: monitor groups, the error text of a failed check, and a bar indicator that stays hidden until something breaks.
