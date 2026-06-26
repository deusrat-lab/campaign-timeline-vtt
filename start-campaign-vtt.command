#!/bin/bash
# Double-click launcher for macOS: starts the Campaign VTT dev server and
# opens the browser. Must never crash just because the preferred port is
# busy — see docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md
# §34 (Stage 6C.5 Phase 2I) for the full writeup of why this exists.
#
# Behavior:
#   1. If PREFERRED_PORT (5175) is free, start Vite there.
#   2. If PREFERRED_PORT is held by this project's own Vite dev server,
#      don't start a second one — just open the browser to it.
#   3. If PREFERRED_PORT is held by anything else, never kill it. Instead
#      scan PORT_RANGE_START..PORT_RANGE_END for a free port and start
#      Campaign VTT there.
#   4. If nothing in the whole range is free, print the blocking process
#      and a safe manual command to free it, then exit non-zero.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
  npm install
fi

PREFERRED_PORT=5175
PORT_RANGE_START=5175
PORT_RANGE_END=5190

# Project fingerprint used to tell "this is our own dev server" apart from
# some unrelated Vite project that happens to be running. Matches either
# the project's directory name in the process command line (covers `vite`
# invoked with a cwd-relative path) or "vite" plus this exact directory
# appearing in the full command (covers `node .../vite ...` invocations).
PROJECT_DIR_NAME="$(basename "$SCRIPT_DIR")"

# Returns 0 (true) if the PID's command line looks like THIS project's
# Vite dev server, 1 otherwise. Never assumes "vite" alone means "ours" —
# some other Vite-based app could be running on the same machine.
is_own_vite_server() {
  local pid="$1"
  local cmd
  cmd=$(ps -p "$pid" -o command= 2>/dev/null)
  if [ -z "$cmd" ]; then
    return 1
  fi
  if echo "$cmd" | grep -qi "vite" && echo "$cmd" | grep -qF "$PROJECT_DIR_NAME"; then
    return 0
  fi
  # Fallback: check the process's actual working directory via lsof,
  # since some invocations (e.g. `npm run dev`) won't have the project
  # path in the command line at all.
  if echo "$cmd" | grep -qi "vite"; then
    local cwd
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep '^n' | sed 's/^n//')
    if [ "$cwd" = "$SCRIPT_DIR" ]; then
      return 0
    fi
  fi
  return 1
}

start_vite_on_port() {
  local port="$1"
  echo "Campaign VTT URL: http://localhost:$port"
  exec npx vite --host 0.0.0.0 --port "$port" --open
}

PID=$(lsof -ti tcp:"$PREFERRED_PORT" -sTCP:LISTEN 2>/dev/null | head -n1)

if [ -z "$PID" ]; then
  start_vite_on_port "$PREFERRED_PORT"
fi

if is_own_vite_server "$PID"; then
  echo "Campaign VTT is already running on port $PREFERRED_PORT. Opening existing app."
  open "http://localhost:$PREFERRED_PORT"
  exit 0
fi

PROCESS_INFO=$(ps -p "$PID" -o command= 2>/dev/null)
echo "Port $PREFERRED_PORT is busy (PID $PID: $PROCESS_INFO), looking for a free port..."

FREE_PORT=""
for ((port = PORT_RANGE_START + 1; port <= PORT_RANGE_END; port++)); do
  if [ -z "$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null)" ]; then
    FREE_PORT="$port"
    break
  fi
done

if [ -n "$FREE_PORT" ]; then
  echo "Port $PREFERRED_PORT is busy, starting Campaign VTT on $FREE_PORT instead."
  start_vite_on_port "$FREE_PORT"
fi

echo "Every port from $PREFERRED_PORT to $PORT_RANGE_END is in use — cannot start Campaign VTT."
echo "Process currently holding port $PREFERRED_PORT (PID $PID): $PROCESS_INFO"
echo "To free it yourself, run: kill $PID"
echo "Then re-run this launcher."
exit 1
