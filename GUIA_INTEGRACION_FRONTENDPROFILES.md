# Guía Técnica: Integrar un Frontend con el CMS usando FrontendProfiles (estado actual del repo)

Esta guía describe **cómo conectar un frontend existente** (React/Vue/etc.) a este CMS, usando el sistema actual de **FrontendProfiles como contrato** (read-only) y **Section.blockTemplate como instancia editable**.

---

## ### 0) Modelo mental (muy corto)

- **FrontendProfile**: contrato de capacidades del frontend (qué secciones y bloques sabe renderizar).  
  **Fuente de verdad**: archivos JSON en `my-headless-cms/backend/profiles/*.json` (**read-only**).
- **Section.schemaKey**: referencia al schema dentro del profile (ej: `hero.simple`, `gallery.grid`).
- **Section.blockTemplate**: instancia materializada y editable del schema (se copia al crear la sección).
- **Post.blocks**: contenido real del post (se genera desde `Section.blockTemplate` al crear un post, si no se envían bloques).

Regla: **los profiles no se editan desde el admin**. Son contrato/infra.

---

## ### 1) Preparación: inventario del frontend (secciones y bloques)

En tu frontend:

- **Lista de secciones** que existirán en el CMS (las que el editor puede crear como “secciones”):
  - Ej: `hero`, `cta`, `projects.index`, `projects.detail`, `thumbnails`, etc.
- Para cada sección define:
  - **schemaKey**: clave estable (string) que identificará ese tipo de sección.
  - **postType**: tipo lógico del CMS para esa sección (`blog`, `page`, `landing`, `detailPage`, etc.).
  - **defaultTemplate**: bloques por defecto que deben aparecer al crear un post.
  - **allowedBlocks**: lista de tipos de bloque permitidos en esa sección.
  - **allowReorder**: si permites reordenar bloques (en admin).

Bloques disponibles (actuales):
- `text`, `image`, `video`, `slideshow`, `embed_instagram`, `embed_soundcloud`

Campos típicos en cada bloque:
- **required**: `true/false`
- **width**: `full | half | third | two-thirds`
- **settings**: (solo donde aplique, ej: slideshow)

---

## ### 1.1) Aclaración clave: `postType` vs `schemaKey`

- **`schemaKey`**: define la **estructura** (qué bloques existen por defecto, allowedBlocks, etc.). Es el “contrato” real.
- **`postType`**: es una **categoría lógica** del CMS (para agrupar/filtrar/decidir comportamiento general).

Ejemplo: puedes tener dos `schemaKey` distintos que ambos usen `postType: "page"` pero con layouts diferentes.

---

## ### 2) Crear un FrontendProfile (archivo JSON en el repo)

Los profiles **se definen como JSON** dentro de:

- `my-headless-cms/backend/profiles/<profile-name>.json`

Formato (estado actual del backend):

```json
{
  "name": "ReactSiteProfile",
  "description": "Perfil para el frontend React X",
  "version": "1.0.0",
  "deprecated": false,
  "sectionSchemas": {
    "hero": {
      "label": "Hero",
      "postType": "landing",
      "defaultTemplate": {
        "blocks": [
          { "type": "text", "required": true, "width": "full" },
          { "type": "image", "required": true, "width": "full" }
        ]
      },
      "allowedBlocks": ["text", "image"],
      "allowReorder": true
    },
    "page_detail": {
      "label": "Page Detail",
      "postType": "page",
      "defaultTemplate": {
        "blocks": [
          { "type": "text", "required": true, "width": "full" },
          {
            "type": "slideshow",
            "required": false,
            "width": "full",
            "settings": { "showArrows": true, "autoplay": false, "interval": 3 }
          },
          { "type": "video", "required": false, "width": "full" }
        ]
      },
      "allowedBlocks": ["text", "slideshow", "video", "image"],
      "allowReorder": true
    }
  }
}
```

Notas:
- **`version`** es string (ej. `"1.0.0"`).
- **`defaultTemplate.blocks`** es donde van los bloques base (no `blocks` directo).
- **El profile es read-only**: no se registra por endpoint, se “registra” añadiendo el JSON.

Recomendación de versionado práctico:
- Si necesitas convivir con varias versiones a la vez, usa el **versionado en el nombre** (ej. `portfolio-minimal@1.0.0`) para poder asignar “v1” y “v2” a sites distintos sin conflicto.

---

## ### 3) Cargar el profile en el backend

El backend:
- lee `backend/profiles/*.json`
- valida forma mínima
- sincroniza un “mirror” en DB para poder asignar profiles a sites

Para aplicar cambios:

- añade/edita el JSON
- **reinicia el backend**

---

## ### 4) Asignar un FrontendProfile a un Site (modo prueba)

El profile se asigna **al Site**, no a una sección.

Opciones:

- **Script** (ya existe en el repo): `my-headless-cms/backend/assign-profile-to-site.js`
  - asigna `default-v1` al site “default” (o el primero), pensado para pruebas.

- **Manual DB** (SQL) o script propio:
  - actualiza `Site.frontendProfileId` para apuntar al profile deseado.

Resultado:
- El site tendrá un “catálogo” de `schemaKey` disponibles para crear secciones.

---

## ### 5) Crear secciones desde el profile (Admin Panel)

En el admin:

- Abre **Manage Sections**
- Click **+ Create New Section**
- El desplegable “Section Type” muestra los schemas disponibles del profile del site actual.

Cuando creas una sección con `schemaKey`:

- Backend toma el schema del **profile en disco**
- Genera:
  - `Section.schemaKey = <schemaKey>`
  - `Section.blockTemplate = deepClone(schema.defaultTemplate)`
  - `Section.postType = schema.postType`

**Importante**:
- `blockTemplate` se materializa al crear la sección.
- No se recalcula automáticamente después (esto evita cambios retroactivos).

“Free Mode”:
- Si creas sección sin schemaKey, `blockTemplate = null` (libertad total).

---

## ### 6) Crear posts basados en templates (flujo actual)

Al crear un post en una sección:

- El admin carga `GET /sections/:id/template` y pinta el `blockTemplate` de la sección.
- Al guardar:
  - si envías `blocks` → el backend usa esos bloques
  - si NO envías `blocks` y la sección tiene `blockTemplate` → el backend genera `Post.blocks` desde el template
  - si no hay template → post “libre” (puede quedarse sin bloques o usar legacy)

En el frontend público:
- **no usa** el template de la sección
- renderiza `Post.blocks` (y `metadata.width`) tal como vienen.

---

## ### 7) Qué me tienes que pasar del frontend para integrarlo

Para conectarlo bien necesito:

- **Lista de secciones** que el frontend soporta:
  - nombres / rutas / componentes relevantes
  - qué `schemaKey` propones para cada una
- **Mapa de tipos de bloques** que renderizas y qué esperas en datos:
  - `text`: usa `block.content` (HTML)
  - `image`: usa `block.content` (URL) y opcional `metadata.caption`
  - `video`: usa `block.content` (URL YouTube/Vimeo)
- `slideshow` (**contrato oficial actual**): **slideshow como bloque**
  - `block.metadata.images = [{ url, caption }]`
  - `block.metadata.slideshowConfig = { showArrows, autoPlay, slideDuration, imageWidth, imageHeight, ... }`
  - Nota: existe un fallback legacy en el frontend para `post.type === "slideshow"` con `post.metadata.slides`, pero **no es el camino recomendado** para contenido nuevo.
- Si tu frontend necesita “secciones especiales” (ej. thumbnails + detail), describir el contrato deseado.

---

## ### 8) Checklist de prueba rápida

- Añadir profile JSON en `backend/profiles/`
- Reiniciar backend
- Asignar profile al site (script o SQL)
- En admin:
  - crear sección desde schemaKey
  - crear post en esa sección y comprobar que aparecen los bloques base
- En frontend:
  - renderizar posts usando `Post.blocks` y `metadata.width`

---

## ### 9) (Opcional) Próximo endurecimiento recomendado

Validación de contrato en backend:
- si `Section.schemaKey` existe, validar en `POST/PUT /posts` que:
  - los bloques enviados están en `allowedBlocks`
  - los required no desaparecen
  - settings/metadata cumplen forma

Esto convierte el profile en un **validador real**, no solo un “generador de defaults”.

---

## ### 10) Frontends especiales: Thumbnails + Detail (estado actual del repo)

Este repo tiene un sistema específico de thumbnails, además de bloques:

- Modelo `Thumbnail` (con `sectionId`, `order`, `imageUrl`, `description`, `detailPostId`)
- Una sección puede ser de tipo `thumbnails` (por `postType`) y el admin muestra una UI especial para gestionar thumbnails.
- Cada thumbnail puede tener un “detail post” asociado (`detailPostId`) que contiene los bloques de la página de detalle.

Si tu frontend necesita este patrón, lo ideal es reflejarlo como “capacidad” del frontend y decidir:
- si se gestiona con el sistema `Thumbnail` (recomendado aquí)
- o si se modela como bloques/relaciones genéricas (más flexible, pero más trabajo)


