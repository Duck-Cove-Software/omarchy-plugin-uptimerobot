# UptimeRobot for Omarchy

An operator view of an [UptimeRobot](https://uptimerobot.com) account, for Omarchy 4.x.

The bar shows a green circle while every monitor is up. When something breaks, it turns red; `Super + U` opens the full view, with whatever is broken pinned to the top and the error message UptimeRobot actually recorded.

The moment the circle goes from green to red, you also get a desktop notification. It is critical, so it stays on screen until you dismiss it, and clicking it opens the full view. Do Not Disturb still holds it back, but it waits in notification history. When everything is up again, a quiet notification says so. Nothing is sent at login if something is already broken, or while the account stays red: one notification per outage.

## Why this shape

UptimeRobot's v2 `getMonitors` call is the one that can carry what an operator view needs in a single round trip: monitor groups, the log text of a failure, response-time samples, 24-hour uptime, and certificate expiry. The v3 list endpoint is cleaner and cannot.

The plugin polls every 20 seconds by default. That is not push — UptimeRobot has no socket for this — and it is inside the free-plan rate limit of 10 requests per minute. How fast you hear about an outage is mostly down to the check interval of each monitor in UptimeRobot (5 minutes on the free plan); for production, also turn on UptimeRobot's own mobile, SMS or voice alerts, which reach you away from this machine.

## Requirements

- Omarchy 4.x (Quickshell shell)
- An UptimeRobot account and a **read-only** API key (Integrations → API)
- `curl`, `jq`, `secret-tool` — all present on a stock Omarchy

## Install

```
omarchy plugin add https://github.com/Duck-Cove-Software/omarchy-plugin-uptimerobot --enable
```

Or, from a local clone:

```
omarchy plugin add /path/to/omarchy-plugin-uptimerobot --enable
```

## Configure

Open the panel and paste a read-only API key. The key is stored in the login keyring; nothing secret is written to `shell.json`.

A read-only key can list monitors and cannot create, edit or delete them. That is the key this plugin wants.

If the panel will not open — the shell is not running, or you are debugging a keyring problem — the same exchange is available from a terminal:

```
~/.config/omarchy/plugins/duckcove.uptimerobot/bin/authenticate.sh
```

## Settings

Two timings can be set on the plugin's bar entry in `~/.config/omarchy/shell.json`. The shell hot-reloads the file on save.

```json
{ "id": "duckcove.uptimerobot", "pollSeconds": 20, "graceSeconds": 0 }
```

| Key            | Default | Range   | Does                                                                                                    |
| -------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `pollSeconds`  | `20`    | 15–3600 | How often to ask UptimeRobot for the latest status                                                      |
| `graceSeconds` | `0`     | 0–600   | How long a monitor must stay Down, or UptimeRobot unreachable, before the bar turns red and you're told |

Each poll is one request plus one per 50 monitors, so keep `pollSeconds` at 15 or more on the free plan's 10 requests a minute (more if you have over 50 monitors). With `graceSeconds` at 0, a single failed poll — your own network dropping for a moment — turns the bar red and sends a notification; set it to 30 or so if that is too eager. UptimeRobot has already retried before it reports a monitor Down, so the grace period does not need to cover that.

The settings are read by the bar widget, so they apply while the plugin is in the bar; without it, the defaults are used.

## Keybinding

The plugin cannot install a binding for you. Add to your Hyprland config:

```
bindd = SUPER, U, UptimeRobot, exec, omarchy-shell shell toggle duckcove.uptimerobot
```

Clicking the indicator opens the same view.

## Using it

| Key     | Does                                 |
| ------- | ------------------------------------ |
| type    | filter monitors                      |
| `↑` `↓` | move                                 |
| `Enter` | open in UptimeRobot, or fold a group |
| `Esc`   | clear the filter, then close         |

Groups, monitors and problems are all listed alphabetically, so where a thing sits depends on what it is called rather than on when you created it.

Selecting a monitor shows its full error message plus how long it has held its current status, a latency sparkline, 24-hour uptime, latency, and certificate expiry where UptimeRobot reports one. Figures it has not reported are left out rather than shown as a dash — not having measured something is not a measurement.

Groups are folded shut by default, so a healthy account is a dozen rows rather than a wall of green. Anything down is pinned above the tree regardless, so folding never hides a problem.

Paused monitors are hidden and only counted — UptimeRobot is not checking them, so they have nothing to report.

When the connection to UptimeRobot is lost, the view says so and greys out. It will not show you stale data that looks healthy.

## Removing

```
omarchy plugin remove duckcove.uptimerobot
```

That deletes the plugin folder. One thing it deliberately does not reach:

- **The API key, in your login keyring.** It survives removal. Clear it with:

```
secret-tool clear service duckcove.uptimerobot account api-key
```

Nothing else is left behind: no cache, no state directory, and no service, timer, hook or scheduled job — the plugin installs none. No process outlives the shell: each helper is torn down as a process group when the panel stops it. The keybinding is the one you added by hand, so it is yours to remove.

## Developing

Clone into `~/.config/omarchy/plugins/duckcove.uptimerobot` and work there — plugin folders may not contain symlinks, so the usual symlink-the-repo trick does not apply. Saving a file hot-reloads the bar widget and the Pane, but not `Service.qml` or what it imports: the shell keeps a running service across a reload, so run `omarchy restart shell` after changing it.

```
bun test
bun run lint
```

There is a canned snapshot for working on the panel without an UptimeRobot account to point it at:

```
omarchy-shell duckcove.uptimerobot.service demo
```

It replaces the in-memory state only — nothing is written, and restarting the shell returns to the real account. Its timestamps are slid to end at load time, so durations read sensibly however old the file is.

The QML lives in thin files; everything with logic in it is plain JavaScript under `src/`, so it can be tested without a running shell.

Two gotchas worth knowing:

- **If an error's line number stops moving when you edit the file, restart the shell.** The QML engine caches a plugin's compiled component for the life of the shell process; hot-reload and even disable/enable will keep serving the old one. `omarchy restart shell`.
- `qmllint` and `qmlformat` in current Qt cannot parse typed function syntax (`function f(): void`), which Quickshell's IPC handlers require. They fail on a minimal example too. Do not chase it.

## Credit

The shape of this plugin — model/service/panel, the bar indicator, secrets on stdin never argv, helpers under `bin/supervise.sh` — is taken from [scoop/omarchy-plugin-uptime-kuma](https://github.com/scoop/omarchy-plugin-uptime-kuma). MIT.

## License

MIT
