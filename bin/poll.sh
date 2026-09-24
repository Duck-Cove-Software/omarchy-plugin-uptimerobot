#!/usr/bin/bash
#
# Fetch one snapshot of an UptimeRobot account.
#
# Reads {"apiKey"} as JSON on stdin, then writes one JSON object on stdout:
# {"monitors":[...],"groups":[...]}. Diagnostics go to stderr. A lost
# connection exits 1 so the caller can back off; a refused key exits 2 so the
# caller can ask for credentials instead of retrying.
#
# The API key is worth what the password is worth, so it is handled the same
# way: never an argument, never an environment variable, only ever a pipe
# between jq and curl, and every binary named by absolute path so that PATH
# cannot decide which curl receives it.
#
# This is meant to be started through bin/supervise.sh, which puts it and its
# curl in a process group of its own so that one signal ends the request rather
# than leaving it open under a shell that has already exited.

set -uo pipefail

export LC_ALL=C

MAX_BODY=4000000
PAGE=50
API_V2="https://api.uptimerobot.com/v2/getMonitors"
API_V3_GROUPS="https://api.uptimerobot.com/v3/monitor-groups"

die() {
    echo "$1" >&2
    exit 1
}

refused() {
    echo "$1" >&2
    exit 2
}

input="$(/usr/bin/head -n 1)"

[[ "$(printf '%s' "$input" |
    /usr/bin/jq -r 'if (.apiKey // "") == "" then "no" else "yes" end')" == "yes" ]] ||
    die "No API key"

[[ -n "${XDG_RUNTIME_DIR:-}" ]] ||
    die "XDG_RUNTIME_DIR is not set, so there is nowhere private to keep the response"
umask 077
body_file="$(/usr/bin/mktemp -p "$XDG_RUNTIME_DIR" duckcove-uptimerobot-body.XXXXXXXXXX)" ||
    die "Could not create a private file for the response"
code_file="$(/usr/bin/mktemp -p "$XDG_RUNTIME_DIR" duckcove-uptimerobot-code.XXXXXXXXXX)" ||
    die "Could not create a private file for the status"
cfg_file="$(/usr/bin/mktemp -p "$XDG_RUNTIME_DIR" duckcove-uptimerobot-curl.XXXXXXXXXX)" ||
    die "Could not create a private file for the request"
job=""

cleanup() {
    if [[ -n $job ]]; then
        kill -- "$job" 2>/dev/null
    fi
    /usr/bin/rm -f -- "$body_file" "$code_file" "$cfg_file"
}

on_signal() {
    trap - EXIT INT TERM HUP
    cleanup
    exit 143
}
trap cleanup EXIT
trap on_signal INT TERM HUP

# 2 means too much data, 3 a refused key, 1 anything else.
fetch_monitors() {
    local offset="$1"
    local rc
    : >"$body_file"
    : >"$code_file"
    {
        printf '%s' "$input" |
            /usr/bin/jq -j --arg offset "$offset" --arg limit "$PAGE" \
                '"api_key=" + (.apiKey | @uri) +
                 "&format=json&logs=1&logs_limit=50&response_times=1&response_times_limit=50&ssl=1&custom_uptime_ratios=1&limit=" + $limit + "&offset=" + $offset' |
            /usr/bin/curl -q -sS --noproxy '*' --proto '=https' --proto-redir '=https' \
                --max-time 30 --max-filesize "$MAX_BODY" \
                -X POST --data-binary @- \
                -o "$body_file" -w '%{http_code}' \
                "$API_V2" >"$code_file"
    } &
    job=$!
    wait "$job" 2>/dev/null
    rc=$?
    job=""
    _classify "$rc"
}

fetch_groups() {
    local rc
    : >"$body_file"
    : >"$code_file"
    {
        printf '%s' "$input" |
            /usr/bin/jq -r '"header = " + (("Authorization: Bearer " + .apiKey) | @json)' >"$cfg_file"
        /usr/bin/curl -q -sS --noproxy '*' --proto '=https' --proto-redir '=https' \
            --max-time 20 --max-filesize "$MAX_BODY" \
            -K "$cfg_file" \
            -o "$body_file" -w '%{http_code}' \
            "$API_V3_GROUPS" >"$code_file"
    } &
    job=$!
    wait "$job" 2>/dev/null
    rc=$?
    job=""
    _classify "$rc"
}

_classify() {
    local rc="$1"
    local code
    local size
    size=$(/usr/bin/wc -c <"$body_file")
    code="$(/usr/bin/tr -d '[:space:]' <"$code_file")"
    if ((size > MAX_BODY)) || ((rc == 63)); then
        return 2
    fi
    if [[ "$code" == "401" || "$code" == "403" ]]; then
        return 3
    fi
    if [[ "$code" != "200" && "$code" != "201" ]]; then
        return 1
    fi
    return 0
}

monitors='[]'
offset=0

while :; do
    fetch_monitors "$offset"
    case $? in
        0) ;;
        2) die "UptimeRobot sent more data than this can handle" ;;
        3) refused "That API key was refused" ;;
        *) die "Cannot reach UptimeRobot" ;;
    esac

    page="$(/usr/bin/cat "$body_file")"
    stat="$(printf '%s' "$page" | /usr/bin/jq -r '.stat // ""' 2>/dev/null)" ||
        die "Unreadable answer from UptimeRobot"
    if [[ "$stat" != "ok" ]]; then
        msg="$(printf '%s' "$page" | /usr/bin/jq -r '.error.message // ""' 2>/dev/null)"
        case "$msg" in
            *api_key* | *API*key*) refused "That API key was refused" ;;
            *) die "${msg:-UptimeRobot refused the request}" ;;
        esac
    fi

    chunk="$(printf '%s' "$page" | /usr/bin/jq -c '.monitors // []')" ||
        die "Unreadable answer from UptimeRobot"
    monitors="$(printf '%s\n%s\n' "$monitors" "$chunk" | /usr/bin/jq -cs 'add')" ||
        die "Unreadable answer from UptimeRobot"
    total="$(printf '%s' "$page" | /usr/bin/jq -r '.pagination.total // 0')"
    count="$(printf '%s' "$monitors" | /usr/bin/jq 'length')"
    if ((count >= total)) || ((count == 0)); then
        break
    fi
    offset=$count
done

groups='[]'
fetch_groups
case $? in
    0)
        groups="$(
            /usr/bin/cat "$body_file" |
                /usr/bin/jq -c '
                    (.data // .monitor_groups // .groups // [])
                    | map({
                        id: (.id // 0),
                        name: (.name // .friendlyName // .friendly_name // ("Group " + ((.id // 0) | tostring)))
                    })
                    | map(select(.id != 0))
                ' 2>/dev/null
        )" || groups='[]'
        ;;
    *) groups='[]' ;;
esac
[[ -n "$groups" ]] || groups='[]'

printf '%s\n%s\n' "$monitors" "$groups" |
    /usr/bin/jq -cs '{monitors: .[0], groups: .[1]}' ||
    die "Unreadable answer from UptimeRobot"
