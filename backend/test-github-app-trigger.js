#!/usr/bin/env node
/**
 * Test GitHub App trigger directly
 */
require('dotenv').config();
const githubApp = require('./github-app');

async function test() {
  console.log('\n🧪 Testing GitHub App Trigger\n');
  
  // Check config
  const config = githubApp.checkConfiguration();
  console.log('Configuration check:', config);
  
  if (!config.ok) {
    console.error('\n❌ GitHub App not configured properly');
    console.error('Missing:', config.missing);
    process.exit(1);
  }
  
  console.log('\n✅ GitHub App configured\n');
  console.log('📡 Triggering workflows for repos...\n');
  
  try {
    const result = await githubApp.triggerWorkflowForRepos('manual-test', { 
      testMode: true,
      timestamp: new Date().toISOString()
    });
    
    console.log('\n✅ Result:');
    console.log(`  Success: ${result.success.length} repo(s)`, result.success);
    console.log(`  Failed: ${result.failed.length} repo(s)`, result.failed);
    
    if (result.success.length > 0) {
      console.log('\n🎉 SUCCESS! Workflows triggered successfully.');
      console.log('\nNext: Check GitHub Actions:');
      result.success.forEach(repo => {
        console.log(`  https://github.com/${repo}/actions`);
      });
    }
    
    if (result.failed.length > 0) {
      console.error('\n❌ Some repos failed. Check logs above for details.');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

test();
