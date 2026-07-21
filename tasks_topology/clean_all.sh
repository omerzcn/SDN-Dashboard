#!/usr/bin/env bash
# clean_all.sh - Full demo reset: topology + ONOS state
# Usage: sudo ./clean_all.sh


# ── Config ────────────────────────────────────────────────────────────────────
ONOS_HOST="${ONOS_HOST:-127.0.0.1}"
ONOS_PORT="${ONOS_PORT:-8181}"
ONOS_USER="${ONOS_USER:-onos}"
ONOS_PASS="${ONOS_PASS:-rocks}"
BASE_URL="http://${ONOS_HOST}:${ONOS_PORT}/onos/v1"
AUTH="${ONOS_USER}:${ONOS_PASS}"

# Core ONOS apps that must NOT be deactivated
CORE_APPS=(
    "org.onosproject.optical-model"
    "org.onosproject.openflow-base"
    "org.onosproject.drivers"
    "org.onosproject.gui2"
    "org.onosproject.gui2-fw-lib"
    "org.onosproject.rest"
    "org.onosproject.cli"
    "org.onosproject.protocols.restconf"
)

# ── Helpers ───────────────────────────────────────────────────────────────────
onos_get()    { curl -sf -u "${AUTH}" -H "Accept: application/json" "${BASE_URL}${1}"; }
onos_delete() { curl -sf -u "${AUTH}" -X DELETE "${BASE_URL}${1}" 2>/dev/null || true; }

is_core_app() {
    local name="$1"
    for core in "${CORE_APPS[@]}"; do
        [[ "$name" == "$core" ]] && return 0
    done
    return 1
}

onos_reachable() {
    curl -sf -u "${AUTH}" "${BASE_URL}/applications" -o /dev/null 2>/dev/null
}

# ── Root check (only needed for topology cleanup) ─────────────────────────────
if [[ "$ONOS_ONLY" == false && $EUID -ne 0 ]]; then
    echo "This script must be run as root for topology cleanup. Use:"
    echo "   sudo $0 $*"
    echo "(or use --onos-only to skip topology cleanup without root)"
    exit 1
fi

echo ""
echo "=========================================="
echo "    ONOS + Topology Full Reset Script"
echo "=========================================="
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# ONOS state cleanup
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "=== Checking ONOS reachability ==="
if ! onos_reachable; then
    echo "    WARNING: ONOS not reachable at ${BASE_URL}. Skipping ONOS cleanup."
    echo ""
    echo "    Topology cleanup complete. ONOS was not reached."
    exit 0
fi
echo "    ONOS is reachable at ${BASE_URL}"

# ── [5/7] Non-core active applications ───────────────────────────────────────
echo ""
echo "=== [5/7] Deactivating non-core ONOS applications ==="

ACTIVE_APPS=$(onos_get "/applications?active=true" | \
    python3 -c "
import sys, json
apps = json.load(sys.stdin).get('applications', [])
for a in apps:
    if a.get('state') == 'ACTIVE':
        print(a['name'])
" 2>/dev/null)

if [[ -z "$ACTIVE_APPS" ]]; then
    echo "    No active applications found (or parse error)."
else
    while IFS= read -r app_name; do
        if is_core_app "$app_name"; then
            echo "    [core - skip]   $app_name"
        else
            onos_delete "/applications/${app_name}/active"
            echo "    [deactivated]   $app_name"
        fi
    done <<< "$ACTIVE_APPS"
fi

# ── [6/7] Intents ─────────────────────────────────────────────────────────────
echo ""
echo "=== [6/7] Removing ONOS intents ==="

# Preferred: use Karaf CLI wipe-out which purges the persistent store
KARAF_CLIENT=$(ls /root/onos/apache-karaf-*/bin/client 2>/dev/null | head -1)
if [[ -n "$KARAF_CLIENT" ]]; then
    echo "    Using Karaf CLI to wipe all ONOS state (persistent store)..."
    "$KARAF_CLIENT" -u onos -p rocks "wipe-out please" 2>/dev/null && \
        echo "    [ok] wipe-out complete." || \
        echo "    [warn] wipe-out failed, falling back to REST delete."
    sleep 2
fi

# Fallback: REST delete with purge=true for each intent
INTENTS=$(onos_get "/intents" | \
    python3 -c "
import sys, json
intents = json.load(sys.stdin).get('intents', [])
for i in intents:
    print(i['appId'] + '/' + i['key'])
" 2>/dev/null)

if [[ -z "$INTENTS" ]]; then
    echo "    No intents remaining."
else
    while IFS= read -r intent; do
        onos_delete "/intents/${intent}?purge=true"
        echo "    Purged intent: $intent"
    done <<< "$INTENTS"
    sleep 1
fi

# ── [7/7] Flows, Hosts, Groups, Meters, Devices, Network config ───────────────
echo ""
echo "=== [7/7] Removing flows, hosts, groups, meters, devices, network-cfg ==="

# Flow rules (per device)
echo "  -- Flows --"
DEVICE_IDS=$(onos_get "/devices" | \
    python3 -c "
import sys, json
devs = json.load(sys.stdin).get('devices', [])
for d in devs:
    print(d['id'])
" 2>/dev/null)

if [[ -z "$DEVICE_IDS" ]]; then
    echo "    No devices / no flows."
else
    while IFS= read -r dev_id; do
        # 1. Fetch all flow IDs for this specific device
        FLOW_IDS=$(onos_get "/flows/${dev_id}" | \
            python3 -c "
import sys, json
flows = json.load(sys.stdin).get('flows', [])
for f in flows:
    print(f['id'])
" 2>/dev/null)

        # 2. Delete each flow individually by its ID
        if [[ -n "$FLOW_IDS" ]]; then
            for f_id in $FLOW_IDS; do
                onos_delete "/flows/${dev_id}/${f_id}"
            done
            echo "    Removed $(echo "$FLOW_IDS" | wc -l) flows on: $dev_id"
        else
            echo "    No flows to remove on: $dev_id"
        fi
    done <<< "$DEVICE_IDS"
fi

# Hosts
echo "  -- Hosts --"
HOST_IDS=$(onos_get "/hosts" | \
    python3 -c "
import sys, json
hosts = json.load(sys.stdin).get('hosts', [])
for h in hosts:
    print(h['id'])
" 2>/dev/null)

if [[ -z "$HOST_IDS" ]]; then
    echo "    No hosts found."
else
    while IFS= read -r host_id; do
        ENC=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$host_id")
        onos_delete "/hosts/${ENC}"
        echo "    Removed host: $host_id"
    done <<< "$HOST_IDS"
fi

# Groups (per device)
echo "  -- Groups --"
if [[ -n "$DEVICE_IDS" ]]; then
    while IFS= read -r dev_id; do
        onos_delete "/groups/${dev_id}"
        echo "    Removed groups on: $dev_id"
    done <<< "$DEVICE_IDS"
fi

# Meters (per device)
echo "  -- Meters --"
if [[ -n "$DEVICE_IDS" ]]; then
    while IFS= read -r dev_id; do
        onos_delete "/meters/${dev_id}"
        echo "    Removed meters on: $dev_id"
    done <<< "$DEVICE_IDS"
fi

# Network configuration (topology-level config pushed via REST)
echo "  -- Network config --"
onos_delete "/network/configuration"
echo "    Cleared network configuration."


echo ""
echo "=========================================="
echo "    Cleanup complete."
echo "    ONOS is ready for a fresh demo."
echo "=========================================="