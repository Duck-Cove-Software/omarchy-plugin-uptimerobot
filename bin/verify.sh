#!/usr/bin/bash
#
# Check an API key against UptimeRobot, once.
#
# Reads {"apiKey"} as JSON on stdin and writes one JSON object on stdout:
# {"ok":true,"email":"..."} on success, or {"ok":false,"error":"..."} otherwise.
#
# No credential is ever a command-line argument or an environment variable.
# /proc/<pid>/cmdline and /proc/<pid>/environ are readable by every process
# running as this user, so a secret that reaches either is a secret anyone on
# the machine can read for as long as the process lives. Everything carrying
# one moves over a pipe instead: jq reads the request object on stdin and
# writes the form body, curl reads the body on stdin.
#
# Every binary is named by its absolute path, and the interpreter is
# /usr/bin/bash rather than /usr/bin/env bash, because PATH is inherited from
# whatever started the shell.

set -uo pipefail

export LC_ALL=C

MAX_BODY=65536
MAX_OUTPUT=65536
API="https://api.uptimerobot.com/v2/getMonitors"

fail() {
    /usr/bin/jq -cn --arg e "$1" '{ok: false, error: $e}'
    exit 0
}

input="$(/usr/bin/head -n 1)"

[[ "$(printf '%s' "$input" |
    /usr/bin/jq -r 'if (.apiKey // "") == "" then "no" else "yes" end')" == "yes" ]] ||
    fail "Enter your UptimeRobot API key"

[[ -n "${XDG_RUNTIME_DIR:-}" ]] ||
    fail "XDG_RUNTIME_DIR is not set, so there is nowhere private to keep the response"
umask 077
body_file="$(/usr/bin/mktemp -p "$XDG_RUNTIME_DIR" duckcove-uptimerobot-body.XXXXXXXXXX)" ||
    fail "Could not create a private file for the response"
trap '/usr/bin/rm -f -- "$body_file"' EXIT

: >"$body_file"
code="$(
    printf '%s' "$input" |
        /usr/bin/jq -j '"api_key=" + (.apiKey | @uri) + "&format=json&limit=1"' |
        /usr/bin/curl -q -sS --noproxy '*' --proto '=https' --proto-redir '=https' \
            --max-time 20 --max-filesize "$MAX_BODY" \
            -X POST --data-binary @- \
            -o "$body_file" -w '%{http_code}' \
            "$API"
)" || fail "Cannot reach UptimeRobot"

out="$(/usr/bin/head -c $((MAX_BODY + 1)) "$body_file")"
((${#out} <= MAX_BODY)) || fail "UptimeRobot sent more data than this can handle"

if [[ "$code" == "401" || "$code" == "403" ]]; then
    fail "That API key was refused"
fi
if [[ "$code" == "429" ]]; then
    fail "UptimeRobot asked us to slow down — try again in a minute"
fi
[[ "$code" == "200" ]] || fail "Cannot reach UptimeRobot"

stat="$(printf '%s' "$out" | /usr/bin/jq -r '.stat // ""' 2>/dev/null)" ||
    fail "Unreadable answer from UptimeRobot"
if [[ "$stat" != "ok" ]]; then
    fail "$(printf '%s' "$out" | /usr/bin/jq -r '.error.message // "That API key was refused"' 2>/dev/null)"
fi

result="$(printf '%s' "$out" |
    /usr/bin/jq -c '{ok: true, email: (.account.email // "")}' |
    /usr/bin/head -c $((MAX_OUTPUT + 1)))"
((${#result} <= MAX_OUTPUT)) || fail "UptimeRobot sent more data than this can handle"
printf '%s\n' "$result"
