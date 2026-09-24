# Changelog

## 1.0.0

First release. An operator view of an UptimeRobot account for Omarchy 4.x.

- Bar indicator: a green circle while every monitor is Up, and a red circle (with the Down count) when something is Down or UptimeRobot is unreachable. Red waits out a 30s grace period, so a single flapping poll does not trip it.
- Desktop notification when the account goes from all green to red, and a quiet one when it is all green again. The alert is critical, so it stays until dismissed; clicking it opens the Pane.
- Pane (`Super + U`, or click the indicator): monitor groups, anything Down pinned to the top, the error text UptimeRobot recorded, and per-monitor latency, 24-hour uptime and certificate expiry. `Enter` opens the monitor on the UptimeRobot dashboard.
- The API key is kept in the login keyring and passed to helpers on stdin, never on a command line.
