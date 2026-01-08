# Diferencia entre blockTemplate y FrontendProfile

## 📋 blockTemplate (en Section) - Sistema Actual

**Qué es:**
- Un template de bloques que está **directamente guardado en una sección específica**
- Se crea manualmente cuando creas o editas una sección
- Cada sección tiene su propio `blockTemplate` (o `null` si no tiene)

**Ejemplo real en tu base de datos:**
```
Section: "Template Test"
  └─ blockTemplate: {
       blocks: [
         { type: "text", required: true, width: "full" },
         { type: "text", required: true, width: "half" },
         { type: "image", required: true, width: "half" },
         { type: "text", required: true, width: "full" }
       ]
     }
```

**Cuándo se usa:**
- Cuando creas un post en esa sección
- El admin panel carga automáticamente esos bloques

**Problema:**
- Si quieres crear otra sección con el mismo template, tienes que copiarlo manualmente
- No hay "catálogo" de tipos de secciones disponibles
- Cada sección es independiente

---

## 🎨 FrontendProfile con sectionSchemas - Sistema Nuevo

**Qué es:**
- Un **catálogo de tipos de secciones** que un frontend puede usar
- Define qué tipos de secciones puedes **crear** en el futuro
- No está en ninguna sección específica, está en el Site

**Ejemplo del profile "default-v1":**
```
FrontendProfile: "default-v1"
  └─ sectionSchemas: {
       "flexible_content": {
         label: "Flexible Content",
         postType: "blog",
         defaultTemplate: {
           blocks: [
             { type: "text", required: true, width: "full" }
           ]
         }
       }
     }
```

**Cuándo se usa:**
- Cuando **creas una nueva sección** desde el admin panel
- Puedes elegir "flexible_content" del dropdown
- El backend genera automáticamente el `blockTemplate` desde el schema
- La nueva sección queda con ese `blockTemplate` guardado

**Ventaja:**
- Tienes un catálogo de tipos de secciones disponibles
- Puedes crear múltiples secciones del mismo tipo fácilmente
- El frontend "declara" qué tipos de secciones necesita

---

## 🔄 Cómo funcionan juntos

### Escenario 1: Sección existente (Template Test)
```
Section: "Template Test"
  └─ blockTemplate: { ... }  ← Ya existe, creado manualmente
  └─ schemaKey: null          ← No viene de un schema
```

**Funciona perfectamente** - El blockTemplate ya está ahí, se usa directamente.

### Escenario 2: Crear nueva sección desde schema
```
1. Admin selecciona schema "flexible_content" del FrontendProfile
2. Backend genera blockTemplate desde el schema
3. Se crea la sección:
   Section: "Nueva Sección"
     └─ blockTemplate: { blocks: [...] }  ← Generado desde schema
     └─ schemaKey: "flexible_content"     ← Referencia al origen
```

**A partir de aquí, funciona igual que la sección existente.**

---

## ❓ ¿Por qué necesitas ambos?

### blockTemplate (en Section):
- ✅ **Ya funciona** - Tus secciones existentes (Template Test) ya lo tienen
- ✅ **Es el estado final** - Lo que realmente se usa al crear posts
- ✅ **Es editable** - Puedes modificar el template después de crear la sección

### FrontendProfile:
- ✅ **Catálogo de opciones** - Define qué tipos de secciones puedes crear
- ✅ **Reutilización** - Crea múltiples secciones del mismo tipo fácilmente
- ✅ **Declaración del frontend** - El frontend "dice" qué necesita

---

## 🎯 Analogía

Imagina que estás construyendo casas:

**blockTemplate** = El plano específico de una casa ya construida
- "Casa #1 tiene: sala, cocina, 2 habitaciones"
- Ese plano está guardado en la casa #1

**FrontendProfile** = El catálogo de tipos de casas que puedes construir
- "Puedo construir: Casa tipo A, Casa tipo B, Casa tipo C"
- Cuando quieres construir una nueva casa, eliges del catálogo
- El catálogo te da el plano base, pero luego puedes modificarlo

---

## 📊 Estado actual de tu sitio

**Sitio: "Default Site"**
- ✅ Tiene FrontendProfile: "default-v1" asignado
- ✅ Profile tiene schema: "flexible_content"

**Secciones existentes:**
- "Template Test" → Tiene `blockTemplate` propio (creado manualmente)
- "Main", "Music", "Contact" → No tienen `blockTemplate` (modo libre)

**Cuando crees una nueva sección:**
- Verás el schema "flexible_content" disponible
- Si lo eliges, se creará con ese template
- Si no, será modo libre (como Main, Music, Contact)

---

## ✅ Conclusión

**No son lo mismo, son complementarios:**

- **blockTemplate** = Template de una sección específica (ya existe en "Template Test")
- **FrontendProfile** = Catálogo para crear nuevas secciones (nuevo sistema)

**Tu sección "Template Test" sigue funcionando igual** - No necesita FrontendProfile porque ya tiene su blockTemplate.

**El FrontendProfile es útil cuando:**
- Quieres crear nuevas secciones
- Quieres tener un catálogo de tipos disponibles
- Quieres que el frontend "declare" qué necesita

