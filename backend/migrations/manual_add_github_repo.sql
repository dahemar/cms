-- Agregar campo githubRepo a la tabla Site
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "githubRepo" TEXT;

-- Actualizar sitios existentes con sus repos correspondientes
-- Ajusta estos valores según tu configuración:

-- Site ID 2 = sympaathy-v2
UPDATE "Site" SET "githubRepo" = 'dahemar/sympaathy-v2' WHERE id = 2;

-- Site ID 3 = cineclub
UPDATE "Site" SET "githubRepo" = 'dahemar/cineclub' WHERE id = 3;

-- Verificar
SELECT id, name, slug, "githubRepo" FROM "Site";
