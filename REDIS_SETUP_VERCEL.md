# Configuración de Redis en Vercel

## **¿Por qué Redis?**

El backend usa cache en memoria local (`contentCache`) que **no se comparte entre instancias serverless**. Esto causa:

- Datos desactualizados (una instancia tiene cache viejo, otra nuevo).
- Invalidación inconsistente (invalidar en una instancia no afecta las demás).

Redis proporciona un **cache compartido** entre todas las instancias de Vercel.

## **Estado actual del código**

✅ **Backend ya está preparado para Redis:**

- `backend/index.js` inicializa cliente Redis si `REDIS_URL` está presente.
- Funciones `getCached()`, `setCache()`, e `invalidateCache()` usan Redis automáticamente.
- Fallback a memoria si Redis no está disponible.

**Solo falta configurar `REDIS_URL` en Vercel.**

---

## **Paso 1: Obtener instancia de Redis**

### **Opción A: Upstash Redis (Recomendado para Vercel)**

1. Crear cuenta en https://upstash.com/
2. Crear base de datos Redis:
   - Region: Elegir la más cercana a tus usuarios (ej: `us-east-1`)
   - Name: `cms-cache`
   - Type: Pay as you go (gratis hasta 10K requests/día)
3. Copiar **REST URL** desde el dashboard
   - Formato: `redis://:PASSWORD@ENDPOINT:PORT`

### **Opción B: Redis Labs**

1. Crear cuenta en https://redis.com/try-free/
2. Crear base de datos (Free tier 30MB)
3. Copiar endpoint y password

### **Opción C: Vercel KV (Beta)**

Si tienes acceso a Vercel KV:

```bash
vercel link
vercel env pull .env
```

El `REDIS_URL` se añade automáticamente.

---

## **Paso 2: Configurar `REDIS_URL` en Vercel**

### **Via CLI:**

```bash
cd /Users/david/Documents/GitHub/cms

# Production
vercel env add REDIS_URL production

# Pegar el URL de Redis cuando lo pida:
# redis://:your_password@endpoint:6379

# Preview (opcional, para testing)
vercel env add REDIS_URL preview
```

### **Via Dashboard:**

1. Ir a https://vercel.com/dahemar/cms-woad-delta/settings/environment-variables
2. Añadir nueva variable:
   - **Name:** `REDIS_URL`
   - **Value:** `redis://:password@endpoint:port` (tu URL de Redis)
   - **Environments:** Production, Preview (ambos)
3. Save

---

## **Paso 3: Redeploy**

```bash
cd /Users/david/Documents/GitHub/cms
vercel --prod
```

O simplemente push a `main` (si tienes auto-deploy):

```bash
git add backend/index.js
git commit -m "feat: complete Redis integration for shared cache

- Make getCached async to check Redis first
- Update all endpoints to await cached results
- Maintain memory fallback if Redis unavailable"
git push origin main
```

---

## **Paso 4: Verificar**

1. **Verificar logs de deploy en Vercel:**
   - Buscar: `[Redis] initialized`
   - Si no aparece, verificar que `REDIS_URL` esté configurado.

2. **Test cache funcionando:**
   ```bash
   # Primera llamada (miss)
   curl -I https://cms-woad-delta.vercel.app/sites \
     -H "Authorization: Bearer YOUR_JWT"
   
   # Segunda llamada (hit desde Redis)
   curl -I https://cms-woad-delta.vercel.app/sites \
     -H "Authorization: Bearer YOUR_JWT"
   ```

3. **Verificar invalidación:**
   - Publicar un post desde admin
   - Verificar que endpoint `/posts` devuelve datos actualizados inmediatamente
   - Si hay delay, revisar logs de invalidación en Vercel

---

## **Troubleshooting**

### **"Redis connection error"**

- Verificar que `REDIS_URL` esté en formato correcto:
  ```
  redis://:password@endpoint:port
  ```
- Verificar que IP de Vercel esté whitelisted en tu proveedor Redis (Upstash/Redis Labs).

### **Cache no se invalida**

- Logs deberían mostrar: `[Redis] invalidateCache(siteId) ...`
- Si no aparece, verificar que mutaciones (POST/PUT/DELETE) llamen `invalidateCache()`.

### **Performance no mejora**

- Verificar latencia a Redis:
  ```bash
  # Local test (desde tu máquina)
  redis-cli -u redis://:password@endpoint:port ping
  ```
- Latencia > 50ms puede ser problemática → elegir region más cercana.

---

## **Monitoreo Redis (Opcional)**

### **Upstash Dashboard:**

- Ver requests/segundo
- Ver tamaño de cache
- Ver hit rate

### **Logs en código:**

El backend ya tiene logs de Redis:

```
[Redis] initialized
[Redis] set error ...
[Redis] get error ...
[Redis] invalidateCache(siteId) failed ...
```

Revisar logs en Vercel: https://vercel.com/dahemar/cms-woad-delta/logs

---

## **Resumen**

| Paso | Acción | Estado |
|------|--------|--------|
| 1 | Código preparado | ✅ Listo |
| 2 | Obtener Redis URL | ⏳ Manual |
| 3 | Configurar `REDIS_URL` en Vercel | ⏳ Manual |
| 4 | Redeploy backend | ⏳ Pendiente |
| 5 | Verificar logs | ⏳ Después de deploy |

**Siguiente paso inmediato:** Obtener Redis URL y configurarlo en Vercel.
