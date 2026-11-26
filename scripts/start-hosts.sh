#!/usr/bin/env bash
# Start the three AgentMesh hosts one at a time, and retry a host that stops during its start-up check.
#   scripts/start-hosts.sh            (or: make hosts)
#
# Why: each host checks the six platform endpoints at start-up. Starting all three at once fires about 18 DNS lookups
# over the VPN together, and a few can fail ("nodename nor servname provided"); a host whose check fails exits.
# Starting them one by one, and retrying, makes `make demo` dependable.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs logs/prev
HOSTS=(handover-orchestrator:8001 handover-qa:8002 handover-kt-session:8003)
TRIES=3
WAIT_S=900   # the first start installs packages, which can take several minutes

healthy() { curl -s -m 2 -o /dev/null "localhost:$1/health"; }

for entry in "${HOSTS[@]}"; do
  agent=${entry%%:*}
  port=${entry##*:}
  if healthy "$port"; then echo "$agent: already running on :$port"; continue; fi
  for try in $(seq 1 $TRIES); do
    [ -f "logs/$agent.log" ] && mv "logs/$agent.log" "logs/prev/$agent-$(date +%Y%m%d-%H%M%S).log"
    echo "$agent: starting on :$port (try $try/$TRIES, log: logs/$agent.log)"
    # startup.sh ends with `exec python -m <agent>.app`, so this PID stays the server's PID once it is up.
    pid=$(cd "agentmesh/hosts/$agent" && { nohup ./startup.sh > "../../../logs/$agent.log" 2>&1 & echo $!; })
    waited=0
    until healthy "$port"; do
      sleep 2
      waited=$((waited + 2))
      if ! kill -0 "$pid" 2> /dev/null && ! healthy "$port"; then
        echo "$agent: stopped during start-up: $(grep -E 'Not reachable|NOT REACHABLE|Error|failed' "logs/$agent.log" | tail -1 | cut -c1-160)"
        break
      fi
      [ $waited -ge $WAIT_S ] && { echo "$agent: not healthy after ${WAIT_S}s; see logs/$agent.log"; break; }
    done
    if healthy "$port"; then echo "$agent: healthy on :$port"; break; fi
    [ "$try" -lt $TRIES ] && sleep 5
  done
  healthy "$port" || { echo "$agent: FAILED to start after $TRIES tries. Check the VPN and Umbrella (make doctor), then retry."; exit 1; }
done
echo "all three hosts are healthy"
