#!/usr/bin/bash
#
# Authenticate once, interactively.
#
# Asks for an UptimeRobot API key, checks it, and puts it in the login keyring.
#
# The key is not echoed and not stored anywhere but the keyring. Nor is it ever
# a command-line argument: /proc/<pid>/cmdline is readable by every process
# running as this user. The request object is built by jq from values fed to it
# on stdin, and the key reaches secret-tool the same way. Every binary is named
# by absolute path, and the interpreter is /usr/bin/bash rather than
# /usr/bin/env bash.

set -uo pipefail

export LC_ALL=C

die() {
    echo "$1" >&2
    exit 1
}

src="${BASH_SOURCE[0]}"
[[ "$src" == */* ]] || src="./$src"
here="$(cd -- "${src%/*}" && pwd -P)" || die "Cannot find the directory this script is in"

echo "UptimeRobot — paste a read-only API key from Integrations → API"
read -rsp "API key: " api_key
echo

[[ -n "$api_key" ]] || die "No API key entered"

result="$(printf '%s\n' "$api_key" |
    /usr/bin/jq -cRn '{apiKey: (inputs // "")}' |
    "$here/supervise.sh" 30 "$here/verify.sh")"

if [[ "$(printf '%s' "$result" | /usr/bin/jq -r '.ok // false')" != "true" ]]; then
    api_key=""
    die "$(printf '%s' "$result" | /usr/bin/jq -r '.error // "That API key was refused"')"
fi

printf '%s' "$api_key" |
    /usr/bin/secret-tool store --label="UptimeRobot API key (duckcove.uptimerobot)" \
        service duckcove.uptimerobot account api-key ||
    {
        api_key=""
        die "Could not write to the login keyring"
    }
api_key=""

email="$(printf '%s' "$result" | /usr/bin/jq -r '.email // ""')"
if [[ -n "$email" ]]; then
    echo "Authenticated as $email. The plugin will connect on its own."
else
    echo "Authenticated. The plugin will connect on its own."
fi
