#!/usr/bin/env node
/**
 * Test script para GitHub App Integration
 * 
 * Verifica que:
 * 1. JWT se genera correctamente
 * 2. Installation token se obtiene sin errores
 * 3. Workflow se dispara en todos los repos configurados
 * 
 * Uso:
 *   node test-github-app.js
 * 
 * Requisitos:
 *   - Variables de entorno configuradas:
 *     GITHUB_APP_ID=123456
 *     GITHUB_APP_PRIVATE_KEY_PATH=/path/to/private-key.pem
 *     # O: GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA..."
 *     GITHUB_APP_INSTALLATION_ID=12345678
 *     GITHUB_FRONTEND_REPOS=dahemar/sympaathy-v2,dahemar/cineclub
 */

require('dotenv').config();
const githubApp = require('./github-app');

async function testGitHubApp() {
  console.log('\n🧪 Testing GitHub App Integration\n');

  // Step 1: Check configuration
  console.log('Step 1: Checking configuration...');
  const config = githubApp.checkConfiguration();
  
  if (!config.ok) {
    console.error('❌ Configuration incomplete. Missing:');
    config.missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nAdd missing variables to your .env file.');
    console.error('See GITHUB_APP_SETUP.md for instructions.');
    process.exit(1);
  }

  console.log('✅ All required variables configured:');
  console.log(`   GITHUB_APP_ID: ${process.env.GITHUB_APP_ID}`);
  console.log(`   GITHUB_APP_INSTALLATION_ID: ${process.env.GITHUB_APP_INSTALLATION_ID}`);
  console.log(`   GITHUB_FRONTEND_REPOS: ${process.env.GITHUB_FRONTEND_REPOS}`);
  
  const hasKeyPath = !!process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  const hasKeyInline = !!process.env.GITHUB_APP_PRIVATE_KEY;
  console.log(`   Private key: ${hasKeyPath ? 'from file' : hasKeyInline ? 'inline' : 'missing'}`);
  console.log('');

  // Step 2: Generate JWT
  console.log('Step 2: Generating JWT...');
  try {
    const jwt = githubApp.generateJWT();
    console.log(`✅ JWT generated successfully`);
    console.log(`   Length: ${jwt.length} characters`);
    console.log(`   Preview: ${jwt.substring(0, 50)}...`);
    console.log('');
  } catch (err) {
    console.error('❌ Failed to generate JWT:', err.message);
    console.error('\nPossible causes:');
    console.error('  1. Private key file not found or invalid path');
    console.error('  2. Private key format incorrect (must be PEM)');
    console.error('  3. GITHUB_APP_ID invalid');
    process.exit(1);
  }

  // Step 3: Get installation token
  console.log('Step 3: Getting installation token...');
  let token;
  try {
    token = await githubApp.getInstallationToken();
    console.log(`✅ Installation token obtained`);
    console.log(`   Token prefix: ${token.substring(0, 10)}...`);
    console.log('');
  } catch (err) {
    console.error('❌ Failed to get installation token:', err.message);
    console.error('\nPossible causes:');
    console.error('  1. GITHUB_APP_INSTALLATION_ID incorrect');
    console.error('  2. GitHub App not installed in any repository');
    console.error('  3. Private key revoked or regenerated');
    console.error('  4. System time/clock skew issue');
    process.exit(1);
  }

  // Step 4: List configured repos
  const repos = process.env.GITHUB_FRONTEND_REPOS.split(',').map(r => r.trim()).filter(Boolean);
  console.log(`Step 4: Triggering workflows for ${repos.length} repo(s)...`);
  repos.forEach((repo, i) => console.log(`   ${i + 1}. ${repo}`));
  console.log('');

  // Step 5: Trigger workflows
  console.log('Step 5: Executing triggers...');
  try {
    const result = await githubApp.triggerWorkflowForRepos('test-script', {
      testMode: true,
      timestamp: new Date().toISOString()
    });

    if (result.success.length > 0) {
      console.log(`✅ Successfully triggered ${result.success.length} repo(s):`);
      result.success.forEach(repo => console.log(`   - ${repo}`));
    }

    if (result.failed.length > 0) {
      console.error(`❌ Failed to trigger ${result.failed.length} repo(s):`);
      result.failed.forEach(repo => console.error(`   - ${repo}`));
    }

    console.log('');
  } catch (err) {
    console.error('❌ Error during workflow trigger:', err.message);
    process.exit(1);
  }

  // Step 6: Next steps
  console.log('🎉 Test completed successfully!\n');
  console.log('Next steps:');
  console.log('  1. Open GitHub Actions to verify workflow runs:');
  repos.forEach(repo => {
    console.log(`     https://github.com/${repo}/actions`);
  });
  console.log('  2. Look for "Update posts_bootstrap.json" workflow');
  console.log('  3. Check that the run was triggered by your GitHub App (bot name)');
  console.log('  4. If you see new runs, the integration is working! 🚀\n');

  console.log('To use in production:');
  console.log('  1. Deploy updated backend to Vercel/Railway');
  console.log('  2. Add environment variables to production');
  console.log('  3. Publish a post in CMS to test automatic rebuild');
  console.log('');
}

testGitHubApp().catch(err => {
  console.error('\n❌ Unexpected error:', err);
  process.exit(1);
});
