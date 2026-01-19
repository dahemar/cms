#!/usr/bin/env node
/**
 * Test script para verificar que triggerFrontendRebuild() funciona correctamente.
 * 
 * Uso:
 *   node test-github-trigger.js
 * 
 * Requisitos:
 *   - Variables de entorno configuradas:
 *     GITHUB_TOKEN=ghp_xxx
 *     GITHUB_REPO_OWNER=dahemar
 *     GITHUB_REPO_NAME=sympaathy-v2
 */

require('dotenv').config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;

async function testTrigger() {
  console.log('\n🧪 Testing GitHub Actions Trigger\n');
  console.log('Config:');
  console.log(`  GITHUB_TOKEN: ${GITHUB_TOKEN ? '✅ Set (' + GITHUB_TOKEN.substring(0, 8) + '...)' : '❌ Missing'}`);
  console.log(`  GITHUB_REPO_OWNER: ${GITHUB_REPO_OWNER || '❌ Missing'}`);
  console.log(`  GITHUB_REPO_NAME: ${GITHUB_REPO_NAME || '❌ Missing'}`);
  console.log('');

  if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
    console.error('❌ ERROR: Missing required environment variables.');
    console.error('');
    console.error('Add to your .env file:');
    console.error('  GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    console.error('  GITHUB_REPO_OWNER=dahemar');
    console.error('  GITHUB_REPO_NAME=sympaathy-v2');
    process.exit(1);
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`;
  const payload = {
    event_type: 'cms-content-updated',
    client_payload: {
      reason: 'manual-test',
      timestamp: new Date().toISOString(),
      testMode: true,
      postId: 999,
      postTitle: 'Test Post from Script'
    }
  };

  console.log(`📡 Sending POST to: ${url}`);
  console.log(`📦 Payload:`, JSON.stringify(payload, null, 2));
  console.log('');

  try {
    const startedAt = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'CMS-Backend-Test-Script'
      },
      body: JSON.stringify(payload)
    });

    const duration = Date.now() - startedAt;

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Request FAILED:');
      console.error(`   Status: ${response.status} ${response.statusText}`);
      console.error(`   Duration: ${duration}ms`);
      console.error('');
      console.error('Response body:');
      console.error(errorText);
      console.error('');
      console.error('Possible causes:');
      console.error('  1. Token expired or invalid');
      console.error('  2. Token missing "repo" or "workflow" scope');
      console.error('  3. Repository owner/name incorrect');
      console.error('  4. Network/firewall blocking GitHub API');
      process.exit(1);
    }

    console.log('✅ SUCCESS! Workflow triggered.');
    console.log(`   Duration: ${duration}ms`);
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Open https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions`);
    console.log(`  2. Look for a new "Update posts_bootstrap.json" workflow run`);
    console.log(`  3. Wait 1-2 minutes for the workflow to complete`);
    console.log('');
    console.log('🎉 If you see a new workflow run, the integration is working!');
  } catch (err) {
    console.error('❌ Request ERROR:', err.message);
    console.error('');
    console.error('Possible causes:');
    console.error('  1. Network connectivity issue');
    console.error('  2. DNS resolution failure');
    console.error('  3. Invalid URL or API endpoint');
    process.exit(1);
  }
}

testTrigger();
