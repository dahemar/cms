# Configuración para Producción

## ⚠️ Checklist de Seguridad

Antes de desplegar a producción, asegúrate de configurar lo siguiente:

### 1. Variables de Entorno (.env)

Copia `.env.example` a `.env` y configura:

```bash
# 1. SESSION_SECRET (OBLIGATORIO)
# Genera uno nuevo y seguro:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Luego pégalo en .env como:
SESSION_SECRET="tu-secret-generado-aqui"

# 2. NODE_ENV
NODE_ENV="production"

# 3. ALLOWED_ORIGINS (OBLIGATORIO)
# Lista de dominios permitidos separados por comas
ALLOWED_ORIGINS="https://tudominio.com,https://www.tudominio.com"

# 4. DATABASE_URL
# Ya debería estar configurado desde desarrollo
DATABASE_URL="postgresql://..."
```

### 2. HTTPS

- **OBLIGATORIO**: El servidor debe usar HTTPS en producción
- Las cookies de sesión requieren `secure: true` (se activa automáticamente cuando `NODE_ENV=production`)
- Usa un certificado SSL válido (Let's Encrypt, Cloudflare, etc.)

### 3. CORS

- **NO** dejes `ALLOWED_ORIGINS` vacío en producción
- Especifica explícitamente los dominios permitidos
- Ejemplo: `ALLOWED_ORIGINS="https://tudominio.com,https://admin.tudominio.com"`

### 4. Base de Datos

- Usa la conexión **Session Pooler** de Supabase (ya configurada)
- Considera usar **Connection Pooling** para mejor rendimiento
- Configura backups automáticos en Supabase

### 5. Servidor

#### Opciones de despliegue:

**Opción A: VPS (DigitalOcean, AWS, etc.)**
```bash
# Instalar Node.js
# Clonar repositorio
# Configurar .env
# Usar PM2 para mantener el proceso corriendo:
npm install -g pm2
pm2 start index.js --name cms-backend
pm2 save
pm2 startup
```

**Opción B: Plataformas como servicio**
- **Vercel**: Configura como serverless function
- **Railway**: Despliegue directo desde Git
- **Render**: Similar a Heroku
- **Fly.io**: Con Docker

**Opción C: Docker**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
```

### 6. Variables de Entorno en Plataformas

#### Vercel / Railway / Render:
- Configura las variables en el dashboard
- **NUNCA** subas `.env` a git

#### Docker:
```bash
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e SESSION_SECRET="tu-secret" \
  -e ALLOWED_ORIGINS="https://tudominio.com" \
  -e DATABASE_URL="postgresql://..." \
  tu-imagen
```

### 7. Frontend

El frontend debe apuntar a tu backend de producción:

```javascript
// En login.html y admin.html, cambia:
const API_URL = "https://api.tudominio.com";
```

### 8. Monitoreo

- Configura logs (Winston, Pino, etc.)
- Monitorea errores (Sentry, Rollbar)
- Configura alertas para caídas del servidor

### 9. Backup

- Supabase tiene backups automáticos
- Considera hacer backups manuales periódicos de la base de datos

### 10. Rate Limiting

Considera agregar rate limiting para prevenir abusos:

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // límite de 100 requests por IP
});

app.use("/auth/", limiter);
```

---

## Comandos Útiles

```bash
# Generar nuevo SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Verificar variables de entorno
node -e "require('dotenv').config(); console.log('NODE_ENV:', process.env.NODE_ENV); console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ Set' : '❌ Missing');"

# Probar conexión a base de datos
npx prisma db pull

# Aplicar migraciones
npx prisma migrate deploy
```

---

## Troubleshooting

### Error: "SESSION_SECRET must be set in production"
- Agrega `SESSION_SECRET` a tu `.env`
- Reinicia el servidor

### Error: CORS bloqueado
- Verifica que `ALLOWED_ORIGINS` incluya tu dominio
- Asegúrate de que el frontend use `credentials: "include"` en fetch

### Cookies no funcionan
- Verifica que estés usando HTTPS
- Verifica que `COOKIE_SECURE` esté en `true` (o no configurado, default true en producción)
- Verifica que el dominio del frontend esté en `ALLOWED_ORIGINS`

---

## Recursos

- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Production Guide](https://supabase.com/docs/guides/platform/going-to-prod)

