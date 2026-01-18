/**
 * GitHub App Integration
 * 
 * Genera tokens de instalación efímeros (~1 hora) para disparar workflows
 * sin necesidad de PATs permanentes.
 * 
 * Requiere:
 *   GITHUB_APP_ID - App ID de la GitHub App
 *   GITHUB_APP_PRIVATE_KEY o GITHUB_APP_PRIVATE_KEY_PATH - Clave privada
 *   GITHUB_APP_INSTALLATION_ID - Installation ID
 * 
 * Uso:
 *   const { triggerWorkflowForRepos } = require('./github-app');
 *   await triggerWorkflowForRepos('post-created', { postId: 123 });
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Cache del installation token (válido ~1 hora)
let cachedToken = null;
let tokenExpiresAt = null;

/**
 * Genera un JWT para autenticarse como GitHub App.
 * El JWT es válido por 10 minutos.
 * 
 * @returns {string} JWT
 */
function generateJWT() {
  const APP_ID = process.env.GITHUB_APP_ID;
  const PRIVATE_KEY_PATH = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  const PRIVATE_KEY_INLINE = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!APP_ID) {
    throw new Error('GITHUB_APP_ID not configured');
  }

  let privateKey;
  if (PRIVATE_KEY_PATH) {
    const fullPath = path.isAbsolute(PRIVATE_KEY_PATH) 
      ? PRIVATE_KEY_PATH 
      : path.resolve(__dirname, PRIVATE_KEY_PATH);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Private key file not found: ${fullPath}`);
    }
    privateKey = fs.readFileSync(fullPath, 'utf8');
  } else if (PRIVATE_KEY_INLINE) {
    // Reemplazar \n literales por saltos de línea reales
    privateKey = PRIVATE_KEY_INLINE.replace(/\\n/g, '\n');
  } else {
    throw new Error('GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Emitido hace 60s (tolerancia de clock skew)
    exp: now + 600, // Expira en 10 minutos
    iss: APP_ID
  };

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${encodedHeader}.${encodedPayload}`)
    .sign(privateKey, 'base64');

  const encodedSignature = base64UrlEncode(Buffer.from(signature, 'base64'));
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Codifica en Base64 URL-safe (sin padding)
 * @param {string|Buffer} input 
 * @returns {string}
 */
function base64UrlEncode(input) {
  const base64 = Buffer.isBuffer(input) 
    ? input.toString('base64')
    : Buffer.from(input).toString('base64');
  
  return base64
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Obtiene un installation token para la App.
 * El token es válido por ~1 hora.
 * Se cachea para evitar requests innecesarios.
 * 
 * @returns {Promise<string>} Installation token
 */
async function getInstallationToken() {
  // 1. Try env var first
  let INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID;
  
  // 2. If not in env, try Prisma DB
  if (!INSTALLATION_ID) {
    try {
      const installation = await prisma.gitHubInstallation.findFirst({
        orderBy: { createdAt: 'desc' }
      });
      if (installation) {
        INSTALLATION_ID = installation.installationId.toString();
      }
    } catch (e) {
      console.warn('[GitHub App] Failed to fetch installation from DB:', e.message);
    }
  }
  
  // 3. Fallback to JSON file (legacy)
  if (!INSTALLATION_ID) {
    try {
      const storagePath = path.resolve(__dirname, 'github_installation.json');
      if (fs.existsSync(storagePath)) {
        const json = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
        if (json && json.installation_id) INSTALLATION_ID = String(json.installation_id);
      }
    } catch (e) {
      // ignore and continue to throw below if still missing
    }
  }

  if (!INSTALLATION_ID) {
    throw new Error('GITHUB_APP_INSTALLATION_ID not configured (check env, DB, or github_installation.json)');
  }

  // Retornar token cacheado si aún es válido (margen de 5 minutos)
  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const jwt = generateJWT();
  const url = `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${jwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'CMS-GitHub-App'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get installation token: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    
    // Cachear el token
    cachedToken = data.token;
    tokenExpiresAt = new Date(data.expires_at).getTime();

    console.log(`[GitHub App] ✅ Installation token obtained (expires at ${data.expires_at})`);
    
    return data.token;
  } catch (err) {
    console.error('[GitHub App] Error getting installation token:', err.message);
    throw err;
  }
}

/**
 * Dispara un workflow en un repositorio usando repository_dispatch.
 * 
 * @param {string} owner - Owner del repo (ej. "dahemar")
 * @param {string} repo - Nombre del repo (ej. "sympaathy-v2")
 * @param {string} reason - Razón del rebuild (para logging)
 * @param {object} meta - Metadata adicional
 * @returns {Promise<void>}
 */
async function triggerWorkflowForRepo(owner, repo, reason, meta = {}) {
  const token = await getInstallationToken();
  const url = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
  
  const payload = {
    event_type: 'cms-content-updated',
    client_payload: {
      reason,
      timestamp: new Date().toISOString(),
      ...meta
    }
  };

  try {
    const startedAt = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'CMS-GitHub-App'
      },
      body: JSON.stringify(payload)
    });

    const duration = Date.now() - startedAt;

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GitHub App] Failed to trigger workflow:', {
        repo: `${owner}/${repo}`,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        reason,
        durationMs: duration
      });
      throw new Error(`Failed to trigger workflow: ${response.status} ${response.statusText}`);
    }

    console.log('[GitHub App] ✅ Workflow triggered:', {
      repo: `${owner}/${repo}`,
      reason,
      durationMs: duration,
      ...meta
    });
  } catch (err) {
    console.error('[GitHub App] Error triggering workflow:', {
      repo: `${owner}/${repo}`,
      reason,
      error: err.message,
      ...meta
    });
    throw err;
  }
}

/**
 * Dispara workflows en múltiples repositorios en paralelo.
 * Lee la lista de repos desde GITHUB_FRONTEND_REPOS (separados por coma).
 * 
 * @param {string} reason - Razón del rebuild
 * @param {object} meta - Metadata adicional
 * @returns {Promise<{success: string[], failed: string[]}>}
 */
async function triggerWorkflowForRepos(reason, meta = {}) {
  const FRONTEND_REPOS = process.env.GITHUB_FRONTEND_REPOS;

  if (!FRONTEND_REPOS) {
    console.warn('[GitHub App] GITHUB_FRONTEND_REPOS not configured, skipping trigger');
    return { success: [], failed: [] };
  }

  const repos = FRONTEND_REPOS.split(',')
    .map(r => r.trim())
    .filter(Boolean);

  if (repos.length === 0) {
    console.warn('[GitHub App] No repos configured in GITHUB_FRONTEND_REPOS');
    return { success: [], failed: [] };
  }

  console.log(`[GitHub App] Triggering workflows for ${repos.length} repo(s):`, repos.join(', '));

  const results = await Promise.allSettled(
    repos.map(async (repoFullName) => {
      const [owner, repo] = repoFullName.split('/');
      if (!owner || !repo) {
        throw new Error(`Invalid repo format: ${repoFullName}. Expected: owner/repo`);
      }
      await triggerWorkflowForRepo(owner, repo, reason, meta);
      return repoFullName;
    })
  );

  const success = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
  
  const failed = results
    .filter(r => r.status === 'rejected')
    .map((r, i) => ({ repo: repos[i], error: r.reason?.message || r.reason }));

  if (failed.length > 0) {
    console.error('[GitHub App] Failed to trigger some workflows:', failed);
  }

  return {
    success,
    failed: failed.map(f => f.repo)
  };
}

/**
 * Verifica que la configuración de GitHub App está completa.
 * @returns {{ok: boolean, missing: string[]}}
 */
function checkConfiguration() {
  const required = [
    'GITHUB_APP_ID',
    'GITHUB_APP_INSTALLATION_ID',
    'GITHUB_FRONTEND_REPOS'
  ];

  const privateKeyConfigured = 
    process.env.GITHUB_APP_PRIVATE_KEY_PATH || 
    process.env.GITHUB_APP_PRIVATE_KEY;

  if (!privateKeyConfigured) {
    required.push('GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH');
  }

  const missing = required.filter(key => {
    if (key.includes(' or ')) return false; // Ya lo chequeamos arriba
    return !process.env[key];
  });

  if (!privateKeyConfigured) {
    missing.push('GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH');
  }

  return {
    ok: missing.length === 0,
    missing
  };
}

module.exports = {
  generateJWT,
  getInstallationToken,
  triggerWorkflowForRepo,
  triggerWorkflowForRepos,
  checkConfiguration
};
