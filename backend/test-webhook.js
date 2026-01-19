#!/usr/bin/env node
/**
 * Test GitHub Webhook Locally
 * 
 * Genera payloads simulados de GitHub webhook y calcula la firma HMAC
 * para probar el endpoint /github/webhook en desarrollo local.
 * 
 * Uso:
 *   node backend/test-webhook.js
 * 
 * Requisitos:
 *   - GITHUB_WEBHOOK_SECRET configurado en .env
 *   - Backend corriendo en http://localhost:3000
 */

require('dotenv').config();
const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const BACKEND_URL = process.env.API_URL || 'http://localhost:3000';
const WEBHOOK_ENDPOINT = `${BACKEND_URL}/github/webhook`;

console.log('\n=== GitHub Webhook Local Test ===\n');

if (!WEBHOOK_SECRET) {
  console.error('❌ ERROR: GITHUB_WEBHOOK_SECRET not configured in .env');
  console.error('\nGenerate one with:');
  console.error('  openssl rand -hex 32\n');
  process.exit(1);
}

console.log('Configuration:');
console.log(`  WEBHOOK_SECRET: ${WEBHOOK_SECRET.slice(0, 8)}...`);
console.log(`  BACKEND_URL: ${BACKEND_URL}`);
console.log(`  WEBHOOK_ENDPOINT: ${WEBHOOK_ENDPOINT}\n`);

// Sample installation event payload (minimal)
const installationPayload = {
  action: 'created',
  installation: {
    id: 99999999,
    account: {
      login: 'test-user',
      type: 'User'
    },
    repository_selection: 'selected',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  repositories: [
    {
      id: 123456,
      name: 'test-repo',
      full_name: 'test-user/test-repo'
    }
  ],
  sender: {
    login: 'test-user',
    type: 'User'
  }
};

const installationRepositoriesPayload = {
  action: 'added',
  installation: {
    id: 99999999,
    account: {
      login: 'test-user',
      type: 'User'
    }
  },
  repositories_added: [
    {
      id: 234567,
      name: 'another-repo',
      full_name: 'test-user/another-repo'
    }
  ],
  repositories_removed: [],
  sender: {
    login: 'test-user',
    type: 'User'
  }
};

/**
 * Calcula firma HMAC SHA256 para payload
 * @param {object} payload 
 * @returns {string} Firma en formato sha256=hex
 */
function calculateSignature(payload) {
  const body = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Envía payload al webhook
 * @param {string} event - Nombre del evento (installation, installation_repositories)
 * @param {object} payload - Payload JSON
 */
async function sendWebhook(event, payload) {
  const body = JSON.stringify(payload);
  const signature = calculateSignature(payload);

  console.log(`\n--- Testing ${event} event ---`);
  console.log(`Payload: ${body.slice(0, 100)}...`);
  console.log(`Signature: ${signature}`);

  try {
    const response = await fetch(WEBHOOK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': event,
        'X-Hub-Signature-256': signature,
        'User-Agent': 'GitHub-Hookshot/test'
      },
      body: body
    });

    const responseText = await response.text();

    if (response.ok) {
      console.log(`✅ SUCCESS: ${response.status} ${response.statusText}`);
      console.log(`   Response: ${responseText}`);
    } else {
      console.error(`❌ FAILED: ${response.status} ${response.statusText}`);
      console.error(`   Response: ${responseText}`);
    }
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
    console.error('\nIs the backend running? Try:');
    console.error('  cd backend && node index.js\n');
  }
}

/**
 * Prueba con firma inválida (debe fallar con 401)
 */
async function testInvalidSignature() {
  console.log('\n--- Testing INVALID signature (should fail with 401) ---');
  
  const body = JSON.stringify(installationPayload);
  const invalidSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

  try {
    const response = await fetch(WEBHOOK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'installation',
        'X-Hub-Signature-256': invalidSignature,
        'User-Agent': 'GitHub-Hookshot/test'
      },
      body: body
    });

    const responseText = await response.text();

    if (response.status === 401) {
      console.log(`✅ EXPECTED: ${response.status} ${response.statusText} (signature rejected)`);
    } else {
      console.error(`❌ UNEXPECTED: ${response.status} ${response.statusText}`);
      console.error(`   Expected 401, got ${response.status}`);
    }
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
  }
}

/**
 * Verifica el contenido guardado
 */
async function checkStoredInstallation() {
  console.log('\n--- Checking stored installation via GET /github/installation ---');
  
  try {
    const response = await fetch(`${BACKEND_URL}/github/installation`);
    const data = await response.json();

    if (response.ok) {
      console.log('✅ Installation data retrieved:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error(`❌ FAILED: ${response.status} ${response.statusText}`);
      console.error(data);
    }
  } catch (err) {
    console.error(`❌ ERROR: ${err.message}`);
  }
}

// Run tests
(async () => {
  try {
    // Test 1: Valid installation event
    await sendWebhook('installation', installationPayload);
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Test 2: Valid installation_repositories event
    await sendWebhook('installation_repositories', installationRepositoriesPayload);
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Test 3: Invalid signature (should fail)
    await testInvalidSignature();
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Test 4: Check stored data
    await checkStoredInstallation();
    
    console.log('\n=== Test Complete ===\n');
    console.log('Next steps:');
    console.log('  1. Check backend/github_installation.json for stored data');
    console.log('  2. Use ngrok to expose webhook publicly:');
    console.log('     ngrok http 3000');
    console.log('  3. Configure webhook URL in GitHub App settings');
    console.log('  4. Use "Deliver test payload" in GitHub to test real delivery\n');
    
  } catch (err) {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
  }
})();
