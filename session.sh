# Local session commands for this project.
# Usage:  source ./session.sh   (bash or zsh)
# Only affects the current shell session — nothing installed globally.

# bash sets BASH_SOURCE for sourced files; zsh sets $0 to the file being
# sourced. Capture this file's path so the chain below resolves from the repo
# root no matter what directory the shell is in. Note: the zsh branch relies on
# the default FUNCTION_ARGZERO option, so it does not resolve the file path when
# zsh is started with --emulate sh (or as sh).
if [[ -n "${BASH_VERSION:-}" ]]; then
  if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Run with:  source ./session.sh"
    exit 1
  fi
  _GEN_AI_SESSION="${BASH_SOURCE[0]}"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  if [[ "${ZSH_EVAL_CONTEXT:-}" != *file* ]]; then
    echo "Run with:  source ./session.sh"
    exit 1
  fi
  _GEN_AI_SESSION="${0}"
else
  echo "session.sh must be sourced from bash or zsh."
  exit 1
fi

# Load extracted logic — all functions become available in this scope.
_GEN_AI_SCRIPT_DIR="$(dirname "${_GEN_AI_SESSION}")"
source "${_GEN_AI_SCRIPT_DIR}/shell-scripts/runpod.sh"
source "${_GEN_AI_SCRIPT_DIR}/shell-scripts/tools-hub.sh"

cat <<'EOF'
Registered:
  thub <start|status|stop|restart>
  comfy -i <input1,..>
  comfy-batch <input-name>
  start-pod [image-key]
  stop-pod
  runpod-comfy [-p <image-key>] -i <input1,..>
EOF

# Prompt prefix, same idea as a Python venv: PS1 is saved, "(gen-ai) " is
# prepended.
# $'\n' is ANSI-C quoting, understood by bash and zsh alike; zsh does not
# expand \n inside a double-quoted prompt.
if [[ "${PS1:-}" ]] && [[ -z "${GEN_AI_DISABLE_PROMPT:-}" ]] && [[ -z "${_GEN_AI_PS1:-}" ]]; then
  _GEN_AI_PS1="${PS1}"
  PS1=$'\n'"(gen-ai) ${PS1}"
  export PS1
fi
