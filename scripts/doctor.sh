#!/usr/bin/env bash
# Checks that this machine is ready to run the Handover agent hosts. Prints no secret values.
#   scripts/doctor.sh      (or: make doctor)
set -uo pipefail
cd "$(dirname "$0")/.."

ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; }
bad()  { printf '  \033[31mFIX\033[0m   %s\n' "$1"; problems=$((problems+1)); }
warn() { printf '  \033[33mwarn\033[0m  %s\n' "$1"; }
problems=0
HOSTS=(handover-orchestrator:8001 handover-qa:8002 handover-kt-session:8003)

echo "Tools"
command -v python3.12 > /dev/null || command -v python3.13 > /dev/null || command -v python3.11 > /dev/null \
  && ok "Python 3.11-3.13 found" || bad "Python 3.11-3.13 missing: brew install python@3.12"
command -v node > /dev/null && ok "Node $(node --version)" || warn "Node missing (needed for the web app): https://nodejs.org or nvm"
command -v git > /dev/null && ok "git" || bad "git missing"
[ "$(git config --get core.hooksPath)" = ".githooks" ] && ok "pre-commit secret hook enabled" || bad "hook not enabled: make setup"

echo "Inputs (not in git: get them from the team, privately)"
for e in "${HOSTS[@]}"; do a=${e%%:*}
  [ -f "inputs/zips/$a.zip" ] && ok "inputs/zips/$a.zip" || bad "inputs/zips/$a.zip missing"
done

echo "Hosts"
for e in "${HOSTS[@]}"; do a=${e%%:*}; p=${e##*:}; env="agentmesh/hosts/$a/.env"
  if [ ! -f "$env" ]; then bad "$a not unpacked: make hosts-unpack"; continue; fi
  missing=""
  for k in AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET; do
    v=$(grep -E "^$k=" "$env" | head -1 | cut -d= -f2-)
    { [ -z "$v" ] || [[ "$v" =~ [[:space:]\"\'] ]] || [[ "$v" == *[“”‘’]* ]]; } && missing="$missing $k"
  done
  [ -z "$missing" ] && ok "$a/.env has the AZURE_* values" || bad "$a/.env: empty or quoted/spaced:$missing (no quotes, no spaces)"
  [ "$(grep -E '^AUTH_MODE=' "$env" | cut -d= -f2)" = "dev" ] && ok "$a AUTH_MODE=dev" || bad "$a: set AUTH_MODE=dev"
  [ "$(grep -E '^PORT=' "$env" | cut -d= -f2)" = "$p" ] && ok "$a PORT=$p" || bad "$a: set PORT=$p"
done

echo "Network (Zenspark VPN)"
env="agentmesh/hosts/handover-orchestrator/.env"
if [ -f "$env" ]; then
  url=$(grep -E '^MCP_DATA_GATEWAY_URL=' "$env" | cut -d= -f2-)
  if [ -n "$url" ] && curl -s -m 15 -o /dev/null "$url/health"; then ok "AgentMesh platform reachable (VPN is up)"
  else bad "AgentMesh platform not reachable: connect the Zenspark VPN (Azure VPN Client)"; fi
else warn "skipped: unpack the hosts first"; fi

echo "Running hosts"
for e in "${HOSTS[@]}"; do a=${e%%:*}; p=${e##*:}
  curl -s -m 3 -o /dev/null "localhost:$p/health" && ok "$a on :$p" || warn "$a not running on :$p (make hosts)"
done

echo
[ "$problems" -eq 0 ] && echo "Ready." || { echo "$problems thing(s) to fix."; exit 1; }
