# Opciones para Unificar blockTemplate y FrontendProfile

## 🎯 Problema Actual

Tener dos conceptos separados puede ser confuso:
- `blockTemplate` en Section (template materializado)
- `FrontendProfile` con `sectionSchemas` (catálogo de schemas)

---

## ✅ Opción 1: Eliminar FrontendProfile, Solo blockTemplate

### Arquitectura:
```
Section
  └─ blockTemplate: JSON (puede ser null)
```

### Ventajas:
- ✅ **Simple** - Un solo concepto
- ✅ **Ya funciona** - Tu sistema actual ya lo usa
- ✅ **Flexible** - Cada sección es independiente

### Desventajas:
- ❌ **No hay catálogo** - No puedes ver qué tipos de secciones puedes crear
- ❌ **Duplicación** - Si quieres 3 secciones iguales, copias el template 3 veces
- ❌ **Sin declaración del frontend** - El frontend no "dice" qué necesita

### Implementación:
- Eliminar modelo FrontendProfile
- Eliminar campo `schemaKey` de Section
- Mantener solo `blockTemplate` en Section

---

## ✅ Opción 2: Eliminar blockTemplate, Solo FrontendProfile

### Arquitectura:
```
FrontendProfile
  └─ sectionSchemas: { "project_detail": {...} }

Section
  └─ schemaKey: "project_detail" (siempre requerido)
  └─ blockTemplate: null (se genera dinámicamente desde schema)
```

### Ventajas:
- ✅ **Un solo concepto** - Todo viene del profile
- ✅ **Catálogo claro** - Sabes qué tipos puedes crear
- ✅ **Declaración del frontend** - El frontend define qué necesita

### Desventajas:
- ❌ **No editable** - No puedes modificar el template después de crear la sección
- ❌ **Rompe compatibilidad** - Secciones existentes como "Template Test" no funcionarían
- ❌ **Menos flexible** - Cada sección está atada a un schema

### Implementación:
- Eliminar campo `blockTemplate` de Section
- Hacer `schemaKey` requerido
- Generar template dinámicamente siempre desde el schema

---

## ✅ Opción 3: Unificar en "SectionTemplate" (Recomendada)

### Arquitectura:
```
SectionTemplate (nueva tabla)
  └─ name: "project_detail"
  └─ label: "Project Detail Page"
  └─ postType: "project"
  └─ blockTemplate: { blocks: [...] }
  └─ siteId: null (global) o específico del site

Section
  └─ sectionTemplateId: Int? (referencia al template)
  └─ blockTemplate: JSON? (copia editable, null si usa template)
```

### Ventajas:
- ✅ **Un solo concepto** - SectionTemplate es el catálogo Y el template
- ✅ **Reutilizable** - Múltiples secciones pueden usar el mismo template
- ✅ **Editable** - Puedes modificar el blockTemplate después (se desvincula del template)
- ✅ **Compatible** - Secciones existentes siguen funcionando

### Flujo:
1. Crear SectionTemplate (desde JSON o admin)
2. Crear Section eligiendo un SectionTemplate
3. Section se crea con `blockTemplate` copiado del template
4. Si editas el `blockTemplate`, se desvincula del template (sectionTemplateId = null)

### Implementación:
- Crear tabla SectionTemplate
- Section puede tener `sectionTemplateId` (referencia) O `blockTemplate` (copia editable)
- FrontendProfile se convierte en una colección de SectionTemplates

---

## ✅ Opción 4: Simplificar - Solo blockTemplate con "Templates Compartidos"

### Arquitectura:
```
SectionTemplate (tabla simple)
  └─ name, blockTemplate, siteId

Section
  └─ sectionTemplateId: Int? (opcional, referencia)
  └─ blockTemplate: JSON? (si no tiene templateId, tiene su propio template)
```

### Ventajas:
- ✅ **Muy simple** - Solo dos tablas relacionadas
- ✅ **Flexible** - Puedes usar template compartido O crear uno propio
- ✅ **Compatible** - Secciones existentes siguen funcionando

### Desventajas:
- ⚠️ **Menos estructura** - No hay "perfil de frontend" explícito
- ⚠️ **Sin versionado** - No hay control de versiones de templates

---

## 🎯 Recomendación: Opción 3 o 4

**Opción 3** es más completa pero más compleja.
**Opción 4** es más simple y directa.

Ambas unifican los conceptos en uno solo: **SectionTemplate**.

---

## 🔄 Migración desde el estado actual

### Si eliges Opción 3 o 4:

1. **Crear tabla SectionTemplate**
2. **Migrar FrontendProfile.sectionSchemas → SectionTemplate**
   - Cada schema se convierte en un SectionTemplate
3. **Migrar Section.blockTemplate → SectionTemplate (opcional)**
   - Si una sección tiene blockTemplate, crear un SectionTemplate para ella
4. **Actualizar Section**
   - Añadir `sectionTemplateId`
   - Mantener `blockTemplate` para compatibilidad
5. **Eliminar FrontendProfile** (o convertirlo en una vista/agrupación de SectionTemplates)

---

## ❓ ¿Cuál prefieres?

- **Opción 1**: Máxima simplicidad, sin catálogo
- **Opción 2**: Todo desde catálogo, menos flexible
- **Opción 3**: Completa pero más compleja
- **Opción 4**: Simple y directa (mi favorita)

