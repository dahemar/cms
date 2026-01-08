# 📋 Estructura del CMS y Funcionalidades Actuales

## 🏗️ Arquitectura del Sistema

### Estructura de Carpetas

```
my-headless-cms/
├── backend/              # Backend API (Express + Prisma + PostgreSQL)
│   ├── index.js         # Servidor principal (puerto 3000)
│   ├── prisma/          # Schema y migraciones de base de datos
│   ├── seed.js          # Script para inicializar datos
│   ├── emailService.js  # Servicio de envío de emails
│   └── .env             # Variables de entorno
│
├── admin/               # Panel de administración (compartido)
│   ├── admin.html       # Interfaz principal del admin
│   ├── login.html       # Página de login/registro
│   ├── server.js        # Servidor HTTP (puerto 8000)
│   └── soundcloud-icon.png
│
└── sites/               # Frontends de cada sitio
    └── default/          # Sitio por defecto
        ├── index.html   # Frontend público
        └── server.js     # Servidor HTTP (puerto 8001)
```

### Servidores y Puertos

- **Backend API**: `http://localhost:3000` - API REST principal
- **Admin Panel**: `http://localhost:8000` - Panel de administración
- **Frontend Público**: `http://localhost:8001` - Sitio web público

---

## 🗄️ Modelo de Datos

### Entidades Principales

#### 1. **User** (Usuarios)
- `id`, `email`, `password` (hasheado), `emailVerified`, `googleId`
- `isAdmin` - Si es `true`, puede acceder a todos los sitios
- Relaciones: `sites` (UserSite), `auditLogs`, tokens de verificación/reset

#### 2. **Site** (Sitios/Frontends)
- `id`, `name`, `slug`, `domain`, `description`
- Cada sitio es un frontend independiente
- Relaciones: `posts`, `sections`, `tags`, `users`, `config`

#### 3. **Post** (Contenido)
- `id`, `title`, `slug`, `type`, `content` (HTML), `published`
- `imageUrl`, `youtubeUrl`, `vimeoUrl` - URLs de medios externos
- `siteId`, `sectionId` - Relaciones con sitio y sección
- `metadata` (JSON) - Campos dinámicos según tipo
- Relaciones: `tags` (many-to-many), `section`, `site`

#### 4. **Section** (Secciones)
- `id`, `name`, `slug`, `description`, `postType`
- `parentId` - Para jerarquías (subsecciones)
- `order` - Orden de visualización
- Cada sección tiene un `postType` único (blog, noticia, producto, etc.)

#### 5. **Tag** (Etiquetas)
- `id`, `name`, `slug`
- Relación many-to-many con `Post`
- Filtrado por `siteId`

#### 6. **AuditLog** (Logs de Auditoría) ⭐ NUEVO
- `id`, `userId`, `action`, `resource`, `resourceId`, `siteId`
- `details` (JSON) - Información adicional
- `ipAddress`, `userAgent` - Información de la petición
- `createdAt` - Timestamp

#### 7. **SiteConfig** (Configuración de Sitio)
- `themeColor`, `logoUrl`, `font`, `customCSS`
- Un sitio tiene una configuración opcional

---

## 🎯 Sistema Multi-Site

### Concepto
Un solo backend puede servir múltiples frontends independientes. Cada sitio:
- Tiene su propio contenido (posts, secciones, tags)
- Puede tener usuarios asignados específicamente
- Puede tener configuración visual propia
- Está aislado de otros sitios

### Resolución de Sitio
El backend detecta automáticamente el sitio desde:
- **Frontend público**: Header `Host` (dominio)
- **Admin panel**: Query param `siteId` o body `siteId`

### Permisos
- **Admin**: Puede acceder a todos los sitios y ver todos los logs
- **Usuario regular**: Solo puede acceder a sus sitios asignados

---

## ✨ Funcionalidades Actuales

### 🔐 Autenticación y Seguridad

#### Login/Registro
- ✅ Registro con email y contraseña
- ✅ Login con email/contraseña
- ✅ Verificación de email (opcional, configurable)
- ✅ Reset de contraseña vía email
- ✅ Login con Google OAuth (si está configurado)
- ✅ Sesiones con cookies seguras

#### Seguridad
- ✅ **Rate Limiting**:
  - Público: 100 requests/15min
  - Autenticación: 5 intentos/15min
  - Admin: 200 requests/15min
- ✅ Passwords hasheados con bcrypt
- ✅ Tokens seguros para verificación/reset
- ✅ Validación de permisos por sitio

### 📝 Gestión de Contenido

#### Posts
- ✅ **Crear posts** con:
  - Título, slug (auto-generado o manual)
  - Contenido HTML (WYSIWYG editor Quill.js)
  - Sección obligatoria (define el tipo de post)
  - Tags opcionales
  - Estado: publicado/borrador
  - Metadata JSON (campos dinámicos)

- ✅ **Editor WYSIWYG** (Quill.js) con:
  - Formato de texto (negrita, cursiva, etc.)
  - Headers, listas, alineación
  - Enlaces
  - **Imágenes** (URLs de Imgur u otros)
  - **Videos** (YouTube o Vimeo - detección automática)
  - **Embeds de Instagram**
  - **Embeds de SoundCloud**
  - Editor de imágenes (recortar/redimensionar)

- ✅ **Editar posts** existentes
- ✅ **Eliminar posts**
- ✅ **Vista previa** antes de publicar
- ✅ **Búsqueda** por título/contenido
- ✅ **Filtros**:
  - Por estado (publicado/borrador)
  - Por sección
  - Por tag
- ✅ **Paginación** (20 posts por página en admin)

#### Secciones
- ✅ **Ver secciones** del sitio
- ✅ Cada sección tiene un `postType` asociado
- ✅ Soporte para jerarquías (subsecciones)
- ✅ Orden personalizable
- ⚠️ Las secciones se crean manualmente (vía seed.js)

#### Tags
- ✅ **Crear tags** para organizar posts
- ✅ **Asignar tags** a posts (many-to-many)
- ✅ **Filtrar posts** por tag
- ✅ Tags específicos por sitio

### 🎨 Frontend Público

#### Visualización
- ✅ **Listar posts publicados** con paginación
- ✅ **Navegación por secciones** (menú)
- ✅ **Renderizado de contenido**:
  - HTML del editor
  - Imágenes (con fallback a múltiples formatos)
  - Videos embebidos (YouTube/Vimeo)
  - Embeds de Instagram
  - Embeds de SoundCloud
- ✅ **Búsqueda** de posts
- ✅ **Filtrado** por sección, tag, tipo

### 📊 Auditoría y Logs ⭐ NUEVO

#### Registro Automático
- ✅ **Login/Logout**: Éxitos y fallos
- ✅ **Registro de usuarios**
- ✅ **Posts**: Creación, actualización, eliminación
- ✅ **Información capturada**:
  - Usuario, acción, recurso, ID del recurso
  - Sitio relacionado
  - IP address, User Agent
  - Timestamp
  - Detalles adicionales (JSON)

#### Visualización (Solo Admins)
- ✅ **Lista de logs** con paginación
- ✅ **Filtros**:
  - Por acción (login, post_created, etc.)
  - Por recurso (user, post, site)
  - Por rango de fechas
- ✅ **Estadísticas**:
  - Total de logs
  - Logs de últimas 24 horas
  - Top acciones más comunes
  - Top usuarios más activos

### ⚡ Cache de Contenido ⭐ NUEVO

- ✅ **Cache en memoria** para posts públicos
- ✅ **TTL configurable** (5 minutos por defecto)
- ✅ **Invalidación automática** al crear/editar/eliminar posts
- ✅ **Limpieza periódica** de entradas expiradas
- ✅ Solo cachea queries simples (sin búsqueda/filtros complejos)

---

## 🔌 API Endpoints Disponibles

### Autenticación
- `POST /auth/register` - Registrar usuario
- `POST /auth/login` - Iniciar sesión
- `POST /auth/logout` - Cerrar sesión
- `GET /auth/me` - Obtener usuario actual
- `GET /auth/verify-email?token=...` - Verificar email
- `POST /auth/resend-verification` - Reenviar email de verificación
- `POST /auth/forgot-password` - Solicitar reset de contraseña
- `POST /auth/reset-password` - Resetear contraseña
- `GET /auth/google` - Iniciar OAuth con Google
- `GET /auth/google/callback` - Callback de Google OAuth

### Posts
- `GET /posts` - Posts publicados (público, con cache)
  - Query params: `page`, `limit`, `search`, `tagId`, `type`, `sectionId`
- `GET /posts/all` - Todos los posts (admin, requiere auth)
  - Query params: `page`, `limit`, `search`, `published`, `tagId`, `type`, `sectionId`
- `POST /posts` - Crear post (requiere auth)
- `PUT /posts/:id` - Editar post (requiere auth)
- `DELETE /posts/:id` - Eliminar post (requiere auth)

### Secciones
- `GET /sections` - Listar secciones (público)
- `GET /post-types` - Tipos de post disponibles
- `POST /sections` - Crear sección (requiere auth)
- `PUT /sections/:id` - Editar sección (requiere auth)
- `DELETE /sections/:id` - Eliminar sección (requiere auth)

### Tags
- `GET /tags` - Listar tags (público)
- `POST /tags` - Crear tag (requiere auth)
- `DELETE /tags/:id` - Eliminar tag (requiere auth)

### Sitios
- `GET /sites` - Listar sitios del usuario (requiere auth)
- `GET /sites/:id` - Obtener sitio específico (requiere auth)
- `GET /sites/:id/config` - Configuración del sitio (público)
- `PUT /sites/:id/config` - Actualizar configuración (requiere auth)

### Auditoría ⭐ NUEVO
- `GET /audit-logs` - Listar logs (solo admins)
  - Query params: `page`, `limit`, `action`, `resource`, `userId`, `siteId`, `startDate`, `endDate`
- `GET /audit-logs/stats` - Estadísticas de auditoría (solo admins)

---

## 👤 Qué Puede Hacer un Usuario

### Usuario Regular
1. **Iniciar sesión** en el admin panel
2. **Ver y gestionar posts** de sus sitios asignados:
   - Crear, editar, eliminar posts
   - Publicar o guardar como borrador
   - Asignar tags y secciones
3. **Gestionar tags** de sus sitios
4. **Ver secciones** disponibles
5. **Usar el editor WYSIWYG** completo
6. **Vista previa** de posts antes de publicar

### Administrador
Todo lo anterior, más:
1. **Acceder a todos los sitios** (selector de sitios)
2. **Ver logs de auditoría**:
   - Historial completo de acciones
   - Estadísticas y métricas
   - Filtros avanzados
3. **Gestionar múltiples sitios** desde un solo panel

---

## 🎨 Características del Editor

### Editor WYSIWYG (Quill.js)
- **Formato de texto**: Negrita, cursiva, subrayado, tachado
- **Headers**: H1-H6
- **Listas**: Ordenadas y con viñetas
- **Alineación**: Izquierda, centro, derecha, justificado
- **Colores**: Texto y fondo
- **Enlaces**: Con validación de URL

### Medios Embebidos
- **Imágenes**: 
  - URLs de Imgur (conversión automática)
  - Editor de imágenes (recortar/redimensionar)
  - Fallback a múltiples formatos
- **Videos**:
  - YouTube (detección automática de URL)
  - Vimeo (detección automática de URL)
  - Previsualización en el editor
- **Instagram**: Embeds de posts y reels
- **SoundCloud**: Embeds de tracks y perfiles (muestra últimos tracks)

---

## 🔧 Configuración y Variables de Entorno

### Backend (.env)
- `DATABASE_URL` - URL de PostgreSQL (Supabase)
- `SESSION_SECRET` - Clave secreta para sesiones
- `FRONTEND_URL` - URL del frontend (para emails)
- `CACHE_TTL` - TTL del cache en ms (opcional, default: 300000)
- `NODE_ENV` - Entorno (development/production)

### Email (opcional)
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`
- O configuración OAuth2 de Gmail

### Google OAuth (opcional)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

---

## 🚀 Flujo de Trabajo Típico

### Para un Editor de Contenido
1. Inicia sesión en `http://localhost:8000/login.html`
2. Accede al admin panel (`http://localhost:8000/admin.html`)
3. Selecciona una sección (si es admin, selecciona el sitio primero)
4. Crea un nuevo post:
   - Escribe título
   - Selecciona sección (el tipo se asigna automáticamente)
   - Escribe contenido en el editor WYSIWYG
   - Añade imágenes/videos/embeds si es necesario
   - Asigna tags opcionales
5. Guarda como borrador o publica directamente
6. Usa "Preview" para ver cómo se verá en el frontend
7. Edita o elimina posts según sea necesario

### Para un Administrador
1. Todo lo anterior, más:
2. Puede cambiar entre sitios usando el selector
3. Accede a "Audit Logs" para ver:
   - Quién hizo qué y cuándo
   - Intentos de login fallidos
   - Cambios en posts
   - Estadísticas de actividad

---

## 📈 Mejoras Recientes Implementadas

### Cache de Contenido
- Mejora el rendimiento de consultas públicas
- Invalidación automática al modificar contenido
- Configurable vía `CACHE_TTL`

### Sistema de Auditoría
- Trazabilidad completa de acciones
- Seguridad mejorada
- Análisis de actividad

### Rate Limiting
- Protección contra abuso
- Diferentes límites según tipo de endpoint
- Headers informativos

---

## 🎯 Próximos Pasos Sugeridos

Ver `MEJORAS_ADICIONALES.md` para una lista completa de mejoras posibles, incluyendo:
- Programar publicaciones
- Historial de versiones
- Gestión de sitios desde UI
- Dashboard multi-site
- Y muchas más...

---

## 📝 Notas Importantes

1. **Secciones**: Actualmente se crean manualmente vía `seed.js`. No hay UI para crearlas desde el admin panel.

2. **Multi-site**: El sistema está preparado para múltiples sitios, pero actualmente solo hay un sitio por defecto.

3. **Cache**: El cache solo funciona para queries simples. Queries con búsqueda o filtros complejos no se cachean.

4. **Auditoría**: Solo los administradores pueden ver los logs de auditoría.

5. **Email**: La verificación de email y reset de contraseña requieren configuración de SMTP o Gmail OAuth2.

---

¿Necesitas más detalles sobre alguna funcionalidad específica?

