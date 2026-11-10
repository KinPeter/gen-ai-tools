#!/usr/bin/env bash
# Source-only library — tools-hub server lifecycle: thub start | status | stop.
# Loaded by session.sh; shell-agnostic (bash 3.2+ and zsh).

# Repo root, resolved from this file's location (never the current directory).
# zsh has no BASH_SOURCE, but $0 is the file being sourced at file scope.
# `cd`/`pwd -P` are builtins because `realpath` is not available on stock macOS.
THUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd -P)"
THUB_PORT_DEFAULT=4218
THUB_PID_FILE="$THUB_ROOT/.tmp/tools-hub.pid"
THUB_LOG_FILE="$THUB_ROOT/.tmp/tools-hub.log"

# Listening port as configured in .env, or the default when unset.
_thub_port() {
  local value=""
  if [[ -f "$THUB_ROOT/.env" ]]; then
    value="$(grep -m1 '^TOOLS_HUB_PORT=' "$THUB_ROOT/.env" | cut -d= -f2)"
  fi
  printf '%s\n' "${value:-$THUB_PORT_DEFAULT}"
}

# PID from the pid file, if that process is still alive. Prints nothing, returns 1 otherwise.
_thub_tracked_pid() {
  local pid
  [[ -f "$THUB_PID_FILE" ]] || return 1
  read -r pid < "$THUB_PID_FILE"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    printf '%s\n' "$pid"
    return 0
  fi
  return 1
}

# First tool available for inspecting a listening port: lsof (macOS + most Linux),
# ss (Linux), nc (last resort). Returns 1 when none exists, so callers report
# "not found" instead of a 127 command-not-found.
_thub_listen_tool() {
  if command -v lsof >/dev/null 2>&1; then printf 'lsof'
  elif command -v ss >/dev/null 2>&1; then printf 'ss'
  elif command -v nc >/dev/null 2>&1; then printf 'nc'
  else return 1
  fi
}

# PID of whatever process is holding the port, started by thub or not.
# `nc` can only say whether a port is open, never who owns it, so it is not
# usable here.
_thub_port_pid() {
  local tool pid=""
  tool="$(_thub_listen_tool)" || return 1
  case "$tool" in
    lsof) pid="$(lsof -iTCP:"$1" -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR>1 {print $2; exit}')" ;;
    ss)
      pid="$(ss -lptn "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1)"
      pid="${pid#pid=}"
      ;;
    *) return 1 ;;
  esac
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    printf '%s\n' "$pid"
    return 0
  fi
  return 1
}

# True when something is listening on the given port.
_thub_is_listening() {
  local tool
  tool="$(_thub_listen_tool)" || return 1
  case "$tool" in
    lsof) lsof -iTCP:"$1" -sTCP:LISTEN -P -n >/dev/null 2>&1 ;;
    ss) ss -ltn "sport = :$1" 2>/dev/null | grep -q LISTEN ;;
    nc) nc -z 127.0.0.1 "$1" >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

# Waits (up to ~10 s) for the port to start listening.
_thub_wait_for_listen() {
  local _i
  for (( _i = 0; _i < 100; _i++ )); do
    if _thub_is_listening "$1"; then return 0; fi
    sleep 0.1
  done
  return 1
}

# Start detached in the background; logs and errors to .tmp/tools-hub.log, truncated each start.
_thub_start() {
  local pid port

  if pid="$(_thub_tracked_pid)"; then
    echo "thub: already running (pid $pid). Run 'thub stop' first." >&2
    return 1
  fi

  port="$(_thub_port)"
  mkdir -p "$THUB_ROOT/.tmp"
  : > "$THUB_LOG_FILE"

  node "$THUB_ROOT/tools-hub/index.mjs" > "$THUB_LOG_FILE" 2>&1 &
  pid=$!
  # Bare disown drops the last background job in bash and zsh alike; a PID
  # argument is not a valid jobspec in either.
  disown
  printf '%s\n' "$pid" > "$THUB_PID_FILE"

  echo "thub: started (pid $pid), logs -> .tmp/tools-hub.log"

  if _thub_wait_for_listen "$port"; then
    echo "thub: listening on http://localhost:$port"
  elif kill -0 "$pid" 2>/dev/null; then
    echo "thub: still starting up (UI build can take a few seconds); check .tmp/tools-hub.log"
  else
    echo "thub: process died on startup. Last log lines:" >&2
    tail -n 10 "$THUB_LOG_FILE" >&2
    rm -f "$THUB_PID_FILE"
    return 1
  fi
  return 0
}

# Report whether the server is up, and where to look for its output.
_thub_status() {
  local pid port

  port="$(_thub_port)"

  if pid="$(_thub_tracked_pid)"; then
    echo "thub: running (pid $pid) on port $port"
    echo "  logs: $THUB_LOG_FILE ($(wc -l < "$THUB_LOG_FILE") lines)"
    return 0
  fi

  if [[ -f "$THUB_PID_FILE" ]]; then
    echo "thub: stale pid file (.tmp/tools-hub.pid) - the process is gone"
  fi

  if pid="$(_thub_port_pid "$port")"; then
    echo "thub: port $port is serving (pid $pid), but it was not started by thub"
    return 0
  fi

  echo "thub: not running"
  return 1
}

# SIGINT (same as Ctrl+C), escalate to SIGTERM, then SIGKILL as a last resort.
_thub_stop() {
  local pid waited

  pid="$(_thub_tracked_pid)"
  if [[ -z "$pid" ]]; then
    pid="$(_thub_port_pid "$(_thub_port)")"
  fi

  if [[ -z "$pid" ]]; then
    echo "thub: not running"
    rm -f "$THUB_PID_FILE"
    return 0
  fi

  kill -INT "$pid" 2>/dev/null
  for (( waited = 0; waited < 20; waited++ )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$THUB_PID_FILE"
      echo "thub: stopped (pid $pid)"
      return 0
    fi
    sleep 0.25
  done

  echo "thub: SIGINT did not stop it (pid $pid), sending SIGTERM" >&2
  kill -TERM "$pid" 2>/dev/null
  for (( waited = 0; waited < 12; waited++ )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$THUB_PID_FILE"
      echo "thub: stopped (pid $pid)"
      return 0
    fi
    sleep 0.25
  done

  echo "thub: pid $pid ignored SIGINT and SIGTERM; killed it. Check .tmp/tools-hub.log" >&2
  kill -9 "$pid" 2>/dev/null
  rm -f "$THUB_PID_FILE"
  return 1
}

thub() {
  case "${1:-}" in
    start) _thub_start ;;
    status) _thub_status ;;
    stop) _thub_stop ;;
    *)
      echo "Usage: thub <start|status|stop>" >&2
      return 2
    ;;
  esac
}
