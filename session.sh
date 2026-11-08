# Local session commands for this project.
# Usage:  source ./session.sh
# Only affects the current shell session — nothing installed globally.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Run with:  source ./session.sh"
  exit 1
fi

# Load extracted logic — all functions become available in this scope.
source "$(dirname "${BASH_SOURCE[0]}")/shell-scripts/runpod.sh"
source "$(dirname "${BASH_SOURCE[0]}")/shell-scripts/tools-hub.sh"

cat <<'EOF'
Registered:
  thub <start|status|stop>
  comfy -i <input1,..>
  comfy-batch <input-name>
  start-pod [image-key]
  stop-pod
  runpod-comfy [-p <image-key>] -i <input1,..>
EOF

# Prompt prefix, same idea as a Python venv: PS1 is saved, "(gen-ai) " is
# prepended, and `unsession` puts the original prompt back.
if [[ "${PS1:-}" ]] && [[ -z "${GEN_AI_DISABLE_PROMPT:-}" ]] && [[ -z "${_GEN_AI_PS1:-}" ]]; then
  _GEN_AI_PS1="${PS1}"
  PS1="\n(gen-ai) ${PS1}"
  export PS1
fi
