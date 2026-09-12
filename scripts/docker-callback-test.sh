#!/bin/sh
#
# Task 38: the Docker image's callback ports, checked against the image itself.
#
#   scripts/docker-callback-test.sh [image]          (default: homematic-manager:ci)
#
# 1. By default the image listens on 2031 (XML-RPC) and 2032 (BIN-RPC), the CCU addon's pair (D-43),
#    and says at start that they are set there and read-only in the settings dialog.
# 2. HMM_CALLBACK_XMLRPC_PORT moves the XML-RPC one, and nothing listens on 2031 then.
# 3. A second container in the first one's network namespace - which is what two containers on one
#    host network are - cannot have the same ports. It says so in one line per protocol, naming the
#    port and the option, keeps running, and does not take a free port instead: in a container a
#    free port is the one nobody published.
#
# The containers get a profile with HmIP-RF (XML-RPC) and CUxD (BIN-RPC) on 127.0.0.1, so both
# callback servers are opened; nothing answers there, which does not matter, because the servers are
# opened before the first `init`. Needs docker and nothing else, no host networking either, so it runs
# the same on a CI runner and on Docker Desktop.

set -u

IMAGE=${1:-homematic-manager:ci}
PREFIX="hmm-cbtest-$$"
CONFIG='{"connection":{"host":"127.0.0.1","interfaces":["HmIP-RF","CUxD"]}}'
failed=0

pass() { echo "  ok   - $1"; }
fail() {
    echo "  FAIL - $1"
    echo "         $2"
    failed=1
}

cleanup() {
    for suffix in a b c; do
        docker rm -f "$PREFIX-$suffix" >/dev/null 2>&1
    done
}
trap cleanup EXIT

# start <name> [docker run options...]: a detached container of the image with the profile above
start() {
    name=$1
    shift
    docker run -d --name "$name" -e HMM_TEST_CONFIG="$CONFIG" "$@" --entrypoint sh "$IMAGE" \
        -c 'printf "%s" "$HMM_TEST_CONFIG" > /data/config.json && exec homematic-manager' >/dev/null
}

# listening <name> <port>: true once something in the container's namespace listens there (30 s)
listening() {
    i=0
    while [ $i -lt 30 ]; do
        if docker exec "$1" netstat -ltn 2>/dev/null | grep -q "[:.]$2 "; then
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done
    return 1
}

# logged <name> <text>: true once the container's log has the text (30 s)
logged() {
    i=0
    while [ $i -lt 30 ]; do
        if docker logs "$1" 2>&1 | grep -F -q "$2"; then
            return 0
        fi
        sleep 1
        i=$((i + 1))
    done
    return 1
}

echo "the image's callback ports ($IMAGE)"

start "$PREFIX-a" || {
    echo "docker run failed" >&2
    exit 1
}
if listening "$PREFIX-a" 2031; then
    pass "listens on 2031 for XML-RPC by default"
else
    fail "listens on 2031 for XML-RPC by default" "$(docker exec "$PREFIX-a" netstat -ltn 2>&1; docker logs "$PREFIX-a" 2>&1 | tail -20)"
fi
if listening "$PREFIX-a" 2032; then
    pass "listens on 2032 for BIN-RPC by default"
else
    fail "listens on 2032 for BIN-RPC by default" "$(docker exec "$PREFIX-a" netstat -ltn 2>&1)"
fi
if logged "$PREFIX-a" "callback: xmlrpc=2031 binrpc=2032 set at start"; then
    pass "and says they are set at start"
else
    fail "and says they are set at start" "$(docker logs "$PREFIX-a" 2>&1 | tail -20)"
fi
if docker logs "$PREFIX-a" 2>&1 | grep -q '2126\|2127'; then
    fail "and nothing names the old pair 2126/2127" "$(docker logs "$PREFIX-a" 2>&1 | grep '2126\|2127')"
else
    pass "and nothing names the old pair 2126/2127"
fi

echo
echo "HMM_CALLBACK_XMLRPC_PORT moves it"
start "$PREFIX-c" -e HMM_CALLBACK_XMLRPC_PORT=2126
if listening "$PREFIX-c" 2126; then
    pass "listens on 2126 with HMM_CALLBACK_XMLRPC_PORT=2126"
else
    fail "listens on 2126 with HMM_CALLBACK_XMLRPC_PORT=2126" "$(docker logs "$PREFIX-c" 2>&1 | tail -20)"
fi
if docker exec "$PREFIX-c" netstat -ltn 2>/dev/null | grep -q '[:.]2031 '; then
    fail "and not on 2031" "$(docker exec "$PREFIX-c" netstat -ltn 2>&1)"
else
    pass "and not on 2031"
fi

echo
echo "a second container on the same network cannot have the same ports"
start "$PREFIX-b" --network "container:$PREFIX-a" -e HMM_PORT=8091
if logged "$PREFIX-b" "callback server: the xmlrpc port 2031 set by HMM_CALLBACK_XMLRPC_PORT / --callback-xmlrpc-port is in use"; then
    pass "the XML-RPC port: one line with the port and the option"
else
    fail "the XML-RPC port: one line with the port and the option" "$(docker logs "$PREFIX-b" 2>&1 | tail -20)"
fi
if logged "$PREFIX-b" "callback server: the binrpc port 2032 set by HMM_CALLBACK_BINRPC_PORT / --callback-binrpc-port is in use"; then
    pass "the BIN-RPC port: the same"
else
    fail "the BIN-RPC port: the same" "$(docker logs "$PREFIX-b" 2>&1 | tail -20)"
fi
if docker logs "$PREFIX-b" 2>&1 | grep -q 'a free port is used'; then
    fail "no free port is taken instead" "$(docker logs "$PREFIX-b" 2>&1 | grep 'free port')"
else
    pass "no free port is taken instead"
fi
if [ "$(docker inspect -f '{{.State.Running}}' "$PREFIX-b" 2>/dev/null)" = true ]; then
    pass "and the second container keeps running"
else
    fail "and the second container keeps running" "$(docker logs "$PREFIX-b" 2>&1 | tail -20)"
fi

echo
if [ "$failed" = 0 ]; then
    echo "docker callback test passed"
else
    echo "docker callback test failed"
fi
exit $failed
