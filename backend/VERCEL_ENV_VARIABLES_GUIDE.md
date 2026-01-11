# Guía: Agregar Variables de Entorno en Vercel

## Ubicación Correcta

Las variables de entorno se configuran en el **proyecto específico**, no en Team settings.

## Pasos Detallados

### Paso 1: Ir al Proyecto

1. Ve a https://vercel.com/dashboard
2. Busca tu proyecto **"cms"** en la lista
3. **Click en el nombre del proyecto** (no en Settings del Team)

### Paso 2: Ir a Settings del Proyecto

1. Una vez dentro del proyecto, en la parte superior verás pestañas:
   - Overview
   - Deployments
   - **Settings** ← Click aquí
   - Analytics
   - etc.

2. Click en **"Settings"**

### Paso 3: Environment Variables

1. En el menú lateral izquierdo de Settings, busca:
   - General
   - **Environment Variables** ← Click aquí
   - Domains
   - etc.

2. Click en **"Environment Variables"**

### Paso 4: Agregar Variable

1. Deberías ver un formulario o botón **"Add New"** o **"Add Variable"**
2. Si no ves el formulario, busca un botón que diga:
   - "Add New"
   - "Add Variable"
   - "Create Variable"
   - O un icono de "+"

3. Click en ese botón

### Paso 5: Completar el Formulario

Deberías ver campos como:

- **Key** (o Name): Aquí escribes el nombre de la variable
- **Value**: Aquí escribes el valor
- **Environment**: Aquí seleccionas Production, Preview, Development
- **Sensitive**: Checkbox para ocultar el valor

### Si No Puedes Seleccionar Environment

**Opción A: El formulario está en modo "Add to Team"**
- Busca un toggle o switch que diga "Add to Project" o "Project Variables"
- Cambia de "Team" a "Project"

**Opción B: Estás en Team Settings**
- Asegúrate de estar en el proyecto específico, no en Team settings
- La URL debería ser: `https://vercel.com/[team]/cms/settings/environment-variables`
- No: `https://vercel.com/[team]/settings/environment-variables`

**Opción C: Usar el Dashboard Directo**
1. Ve a: https://vercel.com/davids-projects-1f1aa011/cms/settings/environment-variables
2. (Reemplaza `davids-projects-1f1aa011` con tu team/username si es diferente)

## Variables a Agregar

### Variable 1:
- **Key**: `UPSTASH_REDIS_REST_URL`
- **Value**: `https://<your-upstash-rest-url>`
- **Environment**: Selecciona "Production" (y "Preview" si quieres)

### Variable 2:
- **Key**: `UPSTASH_REDIS_REST_TOKEN`
- **Value**: `<your-upstash-rest-token>`
- **Environment**: Selecciona "Production" (y "Preview" si quieres)
- **Sensitive**: Marca esta casilla

> Recomendación: copia estos valores desde el dashboard de Upstash para tu base Redis (REST API).
> Nunca pegues tokens reales en documentación commiteada.

## Si el Campo Environment Está Deshabilitado

1. Verifica que estés en **Project Settings**, no Team Settings
2. Intenta refrescar la página (F5)
3. Intenta en modo incógnito o diferente navegador
4. Verifica que tengas permisos de administrador en el proyecto

## Alternativa: Desde el Dashboard

Si no puedes seleccionar el environment, puedes:

1. Agregar la variable sin seleccionar environment (a veces se agrega a todos)
2. Luego editar la variable y agregar los environments específicos

## Verificación

Después de agregar las variables, deberías verlas en la lista con:
- El nombre de la variable
- El environment (Production, Preview, etc.)
- Un icono de ojo para ver el valor (si no es sensitive)

## Troubleshooting

### "No puedo ver el botón Add"
- Asegúrate de estar en el proyecto correcto
- Verifica que tengas permisos de administrador
- Intenta refrescar la página

### "El campo Environment está gris/deshabilitado"
- Verifica que estés en Project Settings, no Team Settings
- Intenta agregar la variable primero y luego editar para agregar environments

### "No veo Environment Variables en el menú"
- Asegúrate de estar en Settings del proyecto
- Busca en el menú lateral izquierdo
- Puede estar agrupado bajo "General" o "Configuration"


