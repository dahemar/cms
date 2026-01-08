# Guía reutilizable: Conectar un frontend existente (p.ej. React) a este CMS

Esta guía documenta el **proceso genérico** para migrar un frontend que consume contenido desde una fuente externa (p.ej. Google Sheets) a este CMS, usando:

- **FrontendProfiles (read-only)** como contrato de capacidades
- **Sections** como “colecciones”/páginas editables
- **Posts + Blocks** como contenido

La guía evita detalles específicos de un site concreto y se centra en el **esquema abstracto**.

---

## ### 1) Preparación: elegir el frontend “canónico”

Si existen varias variantes (estática + app), primero decide cuál es la que vas a mantener.

- Mantén **una sola** como frontend oficial (ej: `frontend/` si es React/Vite).
- Elimina variantes obsoletas para evitar confusión y trabajo duplicado.

Checklist:
- ¿La variante oficial soporta routing?
- ¿Tiene un punto único de carga de contenido (un “data layer”)?
- ¿Los assets (imágenes/video) están en `public/` o servidos por CDN?

---

## ### 2) Inventario del contenido (desde el frontend)

Haz un inventario de “pantallas” o “colecciones” que el editor debería poder modificar:

Ejemplos típicos:
- Landing (una página única)
- Grid con items que linkean a **detalle interno**
- Grid con items que linkean a **link externo**
- Página de detalle (bloques: slideshows, video, texto)
- Bio (lista de bloques/entries)
- Contact (lista de links)

Para cada pantalla define:
- ¿Es **single** (un único post) o **collection** (muchos posts)?
- ¿Qué datos mínimos necesita cada item?
- ¿Qué bloques representan mejor esos datos?

---

## ### 3) Diseño del contrato (FrontendProfile)

Crear un profile JSON en:
- `my-headless-cms/backend/profiles/<profile>.json`

Reglas:
- El profile es **read-only**: fuente de verdad en JSON.
- Cada “tipo de sección” del frontend se representa como **schemaKey**.
- Cada schema define:
  - `postType` (categoría lógica)
  - `defaultTemplate.blocks` (estructura base)
  - `allowedBlocks` (validación)

Ejemplo abstracto (solo estructura):

```json
{
  "name": "frontend-x@1.0.0",
  "version": "1.0.0",
  "sectionSchemas": {
    "landing.single": {
      "postType": "landing",
      "defaultTemplate": { "blocks": [{ "type": "slideshow", "required": true, "width": "full" }] },
      "allowedBlocks": ["slideshow"]
    },
    "grid.externalLinkItem": {
      "postType": "page",
      "defaultTemplate": { "blocks": [
        { "type": "image", "required": true, "width": "full" },
        { "type": "link", "required": true, "width": "full" }
      ]},
      "allowedBlocks": ["image", "link"]
    }
  }
}
```

---

## ### 4) Definir el “catálogo de secciones” (Sections en el CMS)

Crear una **Section por pantalla/colección**.

Patrones recomendados:

- **Landing single**
  - Section: `landing`
  - Un único post publicado (ej. slug fijo `landing`)

- **Grid (collection)**
  - Section: `releases` / `projects` / etc.
  - Un post por item (con `order` controlable via campo/orden)

- **Detail interno**
  - Un post por slug
  - El frontend resuelve `/:slug` → `GET /posts?slug=...`

---

## ### 5) “Bloques especiales”: cuándo crear un tipo nuevo de bloque

Crear un bloque nuevo es apropiado cuando:
- el dato es **estructural**, no un “texto dentro de HTML”
- quieres validarlo con `allowedBlocks`
- quieres que el editor lo vea como “campo” (no como convención)

Ejemplo típico: **link externo** para cards.

Contrato recomendado para `link`:
- `block.type = "link"`
- `block.content = "<url>"`
- `block.metadata` opcional (ej. `targetBlank`, `label`)

Checklist implementación bloque nuevo:
- Admin: añadirlo al selector “Add Block” + UI de edición
- Backend: soportarlo en `generateBlocksFromTemplate`
- Profile: incluirlo en `allowedBlocks`
- Frontend: renderizarlo (p.ej. el card usa ese link)

---

## ### 5.1) Ordenación de items en grids/listas (recomendado)

Si tu frontend tiene grids/listas cuyo orden importa, evita depender de `createdAt`.

Patrón recomendado:
- Añadir `Post.order: Int` (default 0)
- El backend ordena posts por `order ASC, createdAt DESC`
- El admin expone un campo “Order” al editar/crear posts

Esto simplifica:
- grids con orden manual
- listados tipo “bio sections”
- navegación consistente

---

## ### 6) Conectar el data layer del frontend al CMS

Hay dos enfoques:

### A) “Compat endpoint” (rápido)
Crear un endpoint backend que devuelva exactamente el shape que el frontend ya espera.
Ventaja: cambios mínimos en frontend.

### B) “CMS-native” (limpio)
El frontend lee:
- `GET /sections` (para mapear slug→id si hace falta)
- `GET /posts?sectionId=...` (collections)
- `GET /posts?slug=...` (detail)
y transforma `Post.blocks` a props/componentes.

Recomendación:
- Primero A para validar rápido
- Después migrar a B

---

## ### 7) Importación/migración de contenido

Si hay una fuente previa (CSV/Sheets):
- hacer un script de import que:
  - cree posts por sección
  - rellene blocks según el schema
  - marque `published=true`
  - asigne `Post.order` si el frontend depende de orden

---

## ### 8) Validación (contract enforcement)

Si una sección tiene `schemaKey` y su schema define `allowedBlocks`, el backend debería rechazar:
- tipos de bloque no permitidos
- (opcional) ausencia de bloques required

Esto evita que alguien “salte” el admin y rompa el contrato haciendo requests directos a la API.


