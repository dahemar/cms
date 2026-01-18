#!/bin/bash
# test-prerender-flow.sh - Prueba el flujo completo de prerender desde backend hasta Pages
#
# Este script:
# 1. Verifica que el backend está corriendo
# 2. Dispara repository_dispatch manualmente
# 3. Monitorea los GitHub Actions runs
# 4. Verifica que Pages se actualiza con el nuevo contenido
#
# Uso:
#   ./test-prerender-flow.sh
#   ./test-prerender-flow.sh --repo cineclub  # Solo un repo específico

set -euo pipefail

# Configuración
BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
REPOS=("dahemar/cineclub" "dahemar/sympaathy-v2")
TEST_REPO="${1:-}"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🧪 Testing Prerender Flow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Si se especifica un repo, filtrar
if [ "$TEST_REPO" = "--repo" ] && [ -n "${2:-}" ]; then
  case "$2" in
    cineclub)
      REPOS=("dahemar/cineclub")
      ;;
    sympaathy|sympaathy-v2)
      REPOS=("dahemar/sympaathy-v2")
      ;;
    *)
      echo "❌ Repo desconocido: $2"
      exit 1
      ;;
  esac
  echo "🎯 Testing solo: ${REPOS[0]}"
  echo ""
fi

# 1. Verificar backend
echo "1️⃣ Verificando backend..."
if curl -sf "$BACKEND_URL/health" > /dev/null 2>&1 || curl -sf "$BACKEND_URL/posts?limit=1" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Backend activo en $BACKEND_URL${NC}"
else
  echo -e "${RED}❌ Backend no responde en $BACKEND_URL${NC}"
  echo "   Iniciar con: cd backend && node index.js"
  exit 1
fi
echo ""

# 2. Verificar GitHub CLI
echo "2️⃣ Verificando GitHub CLI..."
if ! command -v gh &> /dev/null; then
  echo -e "${RED}❌ GitHub CLI no encontrado${NC}"
  echo "   Instalar con: brew install gh"
  exit 1
fi
echo -e "${GREEN}✅ GitHub CLI instalado${NC}"
echo ""

# 3. Trigger repository_dispatch
echo "3️⃣ Triggering repository_dispatch..."
echo ""

TRIGGERED=()
FAILED=()

for REPO in "${REPOS[@]}"; do
  echo "   📤 Triggering $REPO..."
  
  if gh api "repos/$REPO/dispatches" \
    -X POST \
    -f event_type="cms-content-updated" \
    -f client_payload[reason]="manual-test" \
    -f client_payload[timestamp]="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    > /dev/null 2>&1; then
    
    echo -e "   ${GREEN}✅ Triggered $REPO${NC}"
    TRIGGERED+=("$REPO")
  else
    echo -e "   ${RED}❌ Failed to trigger $REPO${NC}"
    FAILED+=("$REPO")
  fi
done

echo ""

if [ ${#FAILED[@]} -gt 0 ]; then
  echo -e "${RED}⚠️  Algunos repos no se pudieron trigger:${NC}"
  for REPO in "${FAILED[@]}"; do
    echo "   - $REPO"
  done
  echo ""
fi

if [ ${#TRIGGERED[@]} -eq 0 ]; then
  echo -e "${RED}❌ No se pudo trigger ningún repo${NC}"
  exit 1
fi

# 4. Esperar y monitorear runs
echo "4️⃣ Monitoreando GitHub Actions runs..."
echo "   (esperando 5s para que aparezcan los runs...)"
sleep 5
echo ""

MAX_WAIT=300  # 5 minutos
WAIT_INTERVAL=10
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
  ALL_DONE=true
  
  for REPO in "${TRIGGERED[@]}"; do
    RUN_DATA=$(gh run list --repo "$REPO" --limit 1 \
      --json status,conclusion,event,createdAt,databaseId 2>/dev/null || echo "[]")
    
    if [ "$RUN_DATA" = "[]" ]; then
      ALL_DONE=false
      continue
    fi
    
    STATUS=$(echo "$RUN_DATA" | jq -r '.[0].status')
    CONCLUSION=$(echo "$RUN_DATA" | jq -r '.[0].conclusion // "N/A"')
    EVENT=$(echo "$RUN_DATA" | jq -r '.[0].event')
    RUN_ID=$(echo "$RUN_DATA" | jq -r '.[0].databaseId')
    
    # Solo considerar runs de repository_dispatch recientes
    if [ "$EVENT" != "repository_dispatch" ]; then
      continue
    fi
    
    REPO_SHORT=$(echo "$REPO" | sed 's/.*\///')
    
    if [ "$STATUS" = "completed" ]; then
      if [ "$CONCLUSION" = "success" ]; then
        echo -e "   ${GREEN}✅ $REPO_SHORT: completed successfully (run $RUN_ID)${NC}"
      else
        echo -e "   ${RED}❌ $REPO_SHORT: failed with $CONCLUSION (run $RUN_ID)${NC}"
        echo "      Ver logs: gh run view $RUN_ID --repo $REPO --log"
      fi
    else
      echo -e "   ${YELLOW}⏳ $REPO_SHORT: $STATUS${NC}"
      ALL_DONE=false
    fi
  done
  
  if $ALL_DONE; then
    break
  fi
  
  ELAPSED=$((ELAPSED + WAIT_INTERVAL))
  
  if [ $ELAPSED -lt $MAX_WAIT ]; then
    echo ""
    echo "   Esperando ${WAIT_INTERVAL}s... ($ELAPSED/${MAX_WAIT}s)"
    sleep $WAIT_INTERVAL
    echo ""
  fi
done

echo ""

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo -e "${YELLOW}⚠️  Timeout alcanzado (${MAX_WAIT}s)${NC}"
  echo "   Algunos runs pueden seguir en progreso"
  echo ""
fi

# 5. Verificar Pages (opcional)
echo "5️⃣ Verificando Pages deployment..."
echo ""

for REPO in "${TRIGGERED[@]}"; do
  REPO_SHORT=$(echo "$REPO" | sed 's/.*\///')
  OWNER=$(echo "$REPO" | sed 's/\/.*//')
  PAGES_URL="https://${OWNER}.github.io/${REPO_SHORT}/"
  
  echo "   🌐 $REPO_SHORT: $PAGES_URL"
  
  if curl -sf -I "$PAGES_URL" > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ Pages accesible${NC}"
    
    # Verificar posts_bootstrap.json
    BOOTSTRAP_URL="${PAGES_URL}posts_bootstrap.json"
    if curl -sf "$BOOTSTRAP_URL" > /dev/null 2>&1; then
      echo -e "   ${GREEN}✅ posts_bootstrap.json presente${NC}"
    else
      echo -e "   ${YELLOW}⚠️  posts_bootstrap.json no encontrado${NC}"
    fi
  else
    echo -e "   ${YELLOW}⚠️  Pages no accesible (puede tardar unos minutos)${NC}"
  fi
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Test completado${NC}"
echo ""
echo "Ver runs recientes:"
for REPO in "${TRIGGERED[@]}"; do
  echo "  gh run list --repo $REPO --limit 3"
done
echo ""
echo "Ver logs de un run:"
echo "  gh run view <RUN_ID> --repo <OWNER/REPO> --log"
