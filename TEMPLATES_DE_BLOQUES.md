# 📋 Sistema de Templates de Bloques

## 🎯 Concepto

Cada sección puede tener un **template de bloques predefinido** que se autocompleta cuando el cliente crea un nuevo post en esa sección. Esto permite:

- **Consistencia**: El frontend siempre recibe una estructura predecible
- **Flexibilidad**: El cliente puede editar, reordenar y eliminar bloques opcionales
- **Control**: El desarrollador define qué bloques son obligatorios y cuáles opcionales

## 📝 Estructura del Template

Un template es un objeto JSON almacenado en el campo `blockTemplate` de la tabla `Section`:

```json
{
  "blocks": [
    {
      "type": "text",
      "required": true,
      "width": "full"
    },
    {
      "type": "slideshow",
      "required": false,
      "width": "full",
      "settings": {
        "showArrows": true,
        "autoplay": false,
        "interval": 3
      }
    },
    {
      "type": "video",
      "required": false,
      "width": "half"
    }
  ]
}
```

### Propiedades de cada bloque en el template:

- **`type`** (obligatorio): Tipo de bloque (`text`, `image`, `video`, `slideshow`, `embed_instagram`, `embed_soundcloud`)
- **`required`** (opcional, default: `false`): Si es `true`, el bloque no se puede eliminar
- **`width`** (opcional, default: `full`): Ancho del bloque (`full`, `half`, `third`, `two-thirds`)
- **`settings`** (opcional): Configuración específica del bloque (ej: `autoplay`, `interval` para slideshows)

## 🔧 Cómo Configurar un Template

### Opción 1: Desde el código (seed.js o migración)

```javascript
await prisma.section.create({
  data: {
    name: "Detail Pages",
    slug: "detail-pages",
    postType: "detailPage",
    blockTemplate: {
      blocks: [
        {
          type: "text",
          required: true,
          width: "full",
        },
        {
          type: "slideshow",
          required: false,
          width: "full",
          settings: {
            showArrows: true,
            autoplay: false,
            interval: 3,
          },
        },
        {
          type: "video",
          required: false,
          width: "full",
        },
      ],
    },
  },
});
```

### Opción 2: Desde la base de datos directamente

```sql
UPDATE "Section" 
SET "blockTemplate" = '{
  "blocks": [
    {"type": "text", "required": true, "width": "full"},
    {"type": "slideshow", "required": false, "width": "full", "settings": {"showArrows": true, "autoplay": false, "interval": 3}},
    {"type": "video", "required": false, "width": "full"}
  ]
}'::jsonb
WHERE slug = 'detail-pages';
```

### Opción 3: Sin template (libertad total)

Si `blockTemplate` es `null`, el cliente puede crear posts desde cero añadiendo cualquier bloque que quiera.

## 🎨 Flujo de Trabajo

### 1. Cliente crea un nuevo post

1. Selecciona una sección en el admin panel
2. Si la sección tiene un template, los bloques se autocompletan automáticamente
3. El cliente ve los bloques listos para rellenar

### 2. Cliente edita el post

- **Bloques obligatorios** (`required: true`):
  - ✅ Se pueden editar (contenido, configuración)
  - ✅ Se pueden reordenar
  - ❌ **NO se pueden eliminar** (botón deshabilitado)

- **Bloques opcionales** (`required: false`):
  - ✅ Se pueden editar
  - ✅ Se pueden reordenar
  - ✅ Se pueden eliminar

### 3. Guardar y publicar

El post se guarda con la estructura de bloques (obligatorios siempre presentes, opcionales según el cliente).

### 4. Frontend renderiza

El frontend recibe los bloques en orden y los renderiza según el layout definido.

## 📚 Ejemplos de Templates

### Template para "Páginas de Detalle"

```json
{
  "blocks": [
    {"type": "text", "required": true, "width": "full"},
    {"type": "slideshow", "required": false, "width": "full", "settings": {"showArrows": true, "autoplay": false, "interval": 3}},
    {"type": "video", "required": false, "width": "full"},
    {"type": "text", "required": true, "width": "full"}
  ]
}
```

**Resultado**: Cada post tendrá siempre dos bloques de texto (obligatorios) y opcionalmente un slideshow y un video entre ellos.

### Template para "Galerías"

```json
{
  "blocks": [
    {"type": "text", "required": true, "width": "full"},
    {"type": "slideshow", "required": true, "width": "full", "settings": {"showArrows": true, "autoplay": true, "interval": 5}}
  ]
}
```

**Resultado**: Cada post tendrá siempre un bloque de texto y un slideshow (ambos obligatorios).

### Template para "Artículos Flexibles"

```json
{
  "blocks": [
    {"type": "text", "required": true, "width": "full"}
  ]
}
```

**Resultado**: Cada post tendrá un bloque de texto obligatorio, pero el cliente puede añadir más bloques libremente.

### Sin Template (Libertad Total)

```javascript
blockTemplate: null
```

**Resultado**: El cliente puede crear posts desde cero añadiendo cualquier bloque que quiera.

## 🔌 API Endpoints

### GET /sections/:id/template

Obtiene el template de una sección específica.

**Respuesta**:
```json
{
  "sectionId": 1,
  "sectionName": "Detail Pages",
  "postType": "detailPage",
  "blockTemplate": {
    "blocks": [...]
  }
}
```

Si no hay template, `blockTemplate` será `null`.

## ⚙️ Funcionamiento Técnico

### Backend

1. **Al crear un post** (`POST /posts`):
   - Si no se proporcionan bloques en el request
   - Y la sección tiene un `blockTemplate`
   - El backend genera bloques automáticamente usando `generateBlocksFromTemplate()`

2. **Función helper** `generateBlocksFromTemplate(template)`:
   - Recibe el template JSON
   - Genera un array de bloques con la estructura correcta
   - Inicializa cada bloque con valores por defecto según su tipo

### Admin Panel

1. **Al seleccionar una sección**:
   - Hace `GET /sections/:id/template`
   - Si hay template, genera los bloques y los muestra
   - Solo funciona al crear nuevos posts (no al editar)

2. **Visualización**:
   - Bloques obligatorios tienen un badge "REQUIRED" amarillo
   - Botón de eliminar deshabilitado para bloques obligatorios
   - Mensaje de error si se intenta eliminar un bloque obligatorio

## 🎯 Beneficios

| Beneficio | Cómo se logra |
|-----------|---------------|
| **Consistencia** | Templates predeterminados garantizan estructura mínima |
| **Flexibilidad** | Bloques opcionales permiten personalización |
| **Control** | Bloques obligatorios no se pueden eliminar |
| **Escalabilidad** | Fácil añadir nuevos tipos de bloques o templates |
| **UX** | Cliente no empieza desde cero, tiene estructura guiada |

## 📝 Notas

- Los templates solo se aplican al **crear** nuevos posts, no al editar existentes
- Si el cliente proporciona bloques manualmente, se usan esos (puede haber editado el template)
- El frontend debe estar preparado para renderizar todos los tipos de bloques definidos en los templates
- Los bloques opcionales pueden estar vacíos (`content: ""`) y el frontend puede decidir no renderizarlos


