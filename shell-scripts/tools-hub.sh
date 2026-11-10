#!/usr/bin/env bash
# Source-only library — tools-hub server lifecycle: thub start | status | stop | restart.
# Loaded by session.sh; shell-agnostic (bash 3.2+ and zsh).

# Repo root, resolved from this file's location (never the current directory).
# zsh has no BASH_SOURCE, but $0 is the file being sourced at file scope.
# `cd`/`pwd -P` are builtins because `realpath` is not available on stock macOS.
THUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd -P)"
THUB_PORT_DEFAULT=4218
THUB_PID_FILE="$THUB_ROOT/.tmp/tools-hub.pid"
THUB_LOG_FILE="$THUB_ROOT/.tmp/tools-hub.log"

# Port probes (_thub_port, _thub_listen_tool, _thub_port_pid, _thub_is_listening,
# _thub_wait_for_listen, _thub_wait_for_free) live in tools-hub-port.sh.
source "$(dirname "${BASH_SOURCE[0]:-$0}")/tools-hub-port.sh"

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

# Start detached in the background; logs and errors to .tmp/tools-hub.log, truncated each start.
_thub_start() {
  local pid port

  if pid="$(_thub_tracked_pid)"; then
    echo "thub: already running (pid $pid). Run 'thub stop' first." >&2
    return 1
  fi

  port="$(_thub_port)"
  if pid="$(_thub_port_pid "$port")"; then
    echo "thub: port $port is already in use (pid $pid, not started by thub)" >&2
    return 1
  fi

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

# Wait up to <attempts> * 0.25s for a process to exit. 0 = gone, 1 = still alive.
_thub_wait_for_exit() {
  local pid="$1" attempts="$2" _i
  for (( _i = 0; _i < attempts; _i++ )); do
    if ! kill -0 "$pid" 2>/dev/null; then return 0; fi
    sleep 0.25
  done
  return 1
}

# SIGINT (same as Ctrl+C), escalate to SIGTERM, then SIGKILL as a last resort.
# A process on the port that thub did not start is left alone.
_thub_stop() {
  local pid port

  port="$(_thub_port)"
  pid="$(_thub_tracked_pid)"

  if [[ -z "$pid" ]]; then
    rm -f "$THUB_PID_FILE"
    pid="$(_thub_port_pid "$port")"
    if [[ -z "$pid" ]]; then
      echo "thub: not running"
      return 0
    fi
    echo "thub: port $port is held by pid $pid, which thub did not start; leaving it alone" >&2
    echo "  stop it with: kill $pid" >&2
    return 1
  fi

  kill -INT "$pid" 2>/dev/null
  if _thub_wait_for_exit "$pid" 20; then
    rm -f "$THUB_PID_FILE"
    echo "thub: stopped (pid $pid)"
    return 0
  fi

  echo "thub: SIGINT did not stop it (pid $pid), sending SIGTERM" >&2
  kill -TERM "$pid" 2>/dev/null
  if _thub_wait_for_exit "$pid" 12; then
    rm -f "$THUB_PID_FILE"
    echo "thub: stopped (pid $pid)"
    return 0
  fi

  echo "thub: pid $pid ignored SIGINT and SIGTERM; killed it. Check .tmp/tools-hub.log" >&2
  kill -9 "$pid" 2>/dev/null
  rm -f "$THUB_PID_FILE"
  return 1
}

# Stop, then start again — the start rebuilds the browser UI (unless
# TOOLS_HUB_SKIP_UI_BUILD is set). Restarting is skipped while the port is busy.
_thub_restart() {
  local port stop_status=0

  port="$(_thub_port)"

  if ! _thub_stop; then
    stop_status=1
    echo "thub: restart: the old process did not shut down cleanly" >&2
  fi

  if ! _thub_wait_for_free "$port"; then
    echo "thub: restart: port $port is still in use; not starting again" >&2
    return 1
  fi

  _thub_start || return 1
  return $stop_status
}

thub() {
  case "${1:-}" in
    start) _thub_start ;;
    status) _thub_status ;;
    stop) _thub_stop ;;
    restart) _thub_restart ;;
    *)
      echo "Usage: thub <start|status|stop|restart>" >&2
      return 2
    ;;
  esac
}
