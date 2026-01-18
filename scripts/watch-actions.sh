#!/bin/bash
# watch-actions.sh - Monitorea runs de GitHub Actions en tiempo real
#
# Uso:
#   ./watch-actions.sh
#   ./watch-actions.sh --follow  # Auto-refresh cada 10s

set -euo pipefail

REPOS=("dahemar/cineclub" "dahemar/sympaathy-v2")
FOLLOW_MODE="${1:-}"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Verificar que gh CLI está instalado
if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) no encontrado. Instalar con:"
  echo "   brew install gh"
  exit 1
fi

# Función para mostrar status de un repo
show_repo_status() {
  local REPO=$1
  
  echo -e "${BLUE}📦 $REPO${NC}"
  
  # Obtener último run
  local RUN_DATA=$(gh run list --repo "$REPO" --limit 1 \
    --json status,conclusion,name,headBranch,event,createdAt,databaseId,url 2>/dev/null || echo "")
  
  if [ -z "$RUN_DATA" ] || [ "$RUN_DATA" = "[]" ]; then
    echo "  No runs found"
    return
  fi
  
  local STATUS=$(echo "$RUN_DATA" | jq -r '.[0].status')
  local CONCLUSION=$(echo "$RUN_DATA" | jq -r '.[0].conclusion // "N/A"')
  local NAME=$(echo "$RUN_DATA" | jq -r '.[0].name')
  local EVENT=$(echo "$RUN_DATA" | jq -r '.[0].event')
  local CREATED_AT=$(echo "$RUN_DATA" | jq -r '.[0].createdAt')
  local RUN_ID=$(echo "$RUN_DATA" | jq -r '.[0].databaseId')
  local URL=$(echo "$RUN_DATA" | jq -r '.[0].url')
  
  # Formatear fecha
  local CREATED_FORMATTED=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$CREATED_AT" "+%H:%M:%S" 2>/dev/null || echo "$CREATED_AT")
  
  # Color según status
  local STATUS_COLOR=$YELLOW
  if [ "$STATUS" = "completed" ]; then
    if [ "$CONCLUSION" = "success" ]; then
      STATUS_COLOR=$GREEN
    else
      STATUS_COLOR=$RED
    fi
  fi
  
  echo -e "  Status: ${STATUS_COLOR}${STATUS}${NC} | Conclusion: ${STATUS_COLOR}${CONCLUSION}${NC}"
  echo "  Workflow: $NAME"
  echo "  Event: $EVENT | Created: $CREATED_FORMATTED"
  echo "  Run ID: $RUN_ID"
  echo "  URL: $URL"
  
  # Si está en progreso o falló, mostrar logs relevantes
  if [ "$STATUS" = "in_progress" ] || [ "$STATUS" = "queued" ]; then
    echo -e "  ${YELLOW}⏳ Running...${NC}"
  elif [ "$CONCLUSION" = "failure" ]; then
    echo -e "  ${RED}❌ Failed! Ver logs:${NC}"
    echo "     gh run view $RUN_ID --repo $REPO --log"
  elif [ "$CONCLUSION" = "success" ]; then
    echo -e "  ${GREEN}✅ Success!${NC}"
  fi
}

# Función principal de display
display_status() {
  if [ "$FOLLOW_MODE" = "--follow" ]; then
    clear
  fi
  
  echo "🔍 GitHub Actions Status - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  for REPO in "${REPOS[@]}"; do
    show_repo_status "$REPO"
    echo ""
  done
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  if [ "$FOLLOW_MODE" = "--follow" ]; then
    echo "Refrescando en 10s... (Ctrl+C para salir)"
  fi
}

# Si está en modo follow, loop infinito
if [ "$FOLLOW_MODE" = "--follow" ]; then
  while true; do
    display_status
    sleep 10
  done
else
  display_status
fi
