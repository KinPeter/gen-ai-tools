#!/usr/bin/env bash
# Source-only library — tools-hub port probes: which port, who holds it, when it is up.
# Sourced by tools-hub.sh; shell-agnostic (bash 3.2+ and zsh).
# Uses THUB_ROOT and THUB_PORT_DEFAULT, defined at file scope by tools-hub.sh.

# Listening port as configured in .env, or the default when unset.
_thub_port() {
  local value=""
  if [[ -f "$THUB_ROOT/.env" ]]; then
    value="$(grep -m1 '^TOOLS_HUB_PORT=' "$THUB_ROOT/.env" | cut -d= -f2)"
  fi
  printf '%s\n' "${value:-$THUB_PORT_DEFAULT}"
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

# Waits (up to ~5 s) for the port to stop listening. 0 = free, 1 = still bound.
_thub_wait_for_free() {
  local _i
  for (( _i = 0; _i < 50; _i++ )); do
    if ! _thub_is_listening "$1"; then return 0; fi
    sleep 0.1
  done
  return 1
}
