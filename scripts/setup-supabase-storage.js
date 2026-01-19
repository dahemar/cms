#!/usr/bin/env node
/**
 * Supabase Storage Setup Script
 * 
 * Creates the prerender bucket in Supabase Storage and configures permissions
 * 
 * Prerequisites:
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured
 * - Supabase project must exist
 * 
 * Usage:
 *   node scripts/setup-supabase-storage.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'prerender';

async function setupStorage() {
  console.log('\n🚀 Supabase Storage Setup\n');
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ ERROR: Missing required environment variables');
    console.error('   Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    console.error('\n   Add to your .env file:');
    console.error(`   SUPABASE_URL=https://your-project.supabase.co`);
    console.error(`   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`);
    console.error(`   SUPABASE_BUCKET=${BUCKET_NAME}\n`);
    process.exit(1);
  }

  console.log(`✓ SUPABASE_URL: ${SUPABASE_URL}`);
  console.log(`✓ SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}...`);
  console.log(`✓ BUCKET_NAME: ${BUCKET_NAME}\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Step 1: Check if bucket exists
  console.log(`📦 Checking if bucket "${BUCKET_NAME}" exists...`);
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('❌ Error listing buckets:', listError.message);
    process.exit(1);
  }

  const bucketExists = buckets.some(b => b.name === BUCKET_NAME);

  if (bucketExists) {
    console.log(`✓ Bucket "${BUCKET_NAME}" already exists\n`);
  } else {
    // Step 2: Create bucket (public)
    console.log(`📦 Creating bucket "${BUCKET_NAME}"...`);
    const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 10485760, // 10 MB
      allowedMimeTypes: ['application/json', 'text/html', 'text/plain']
    });

    if (error) {
      console.error('❌ Error creating bucket:', error.message);
      process.exit(1);
    }

    console.log(`✓ Bucket "${BUCKET_NAME}" created successfully\n`);
  }

  // Step 3: Verify access
  console.log('🔍 Verifying bucket access...');
  const testPath = '_test/setup-test.json';
  const testContent = JSON.stringify({ test: true, timestamp: Date.now() });

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(testPath, Buffer.from(testContent), {
      contentType: 'application/json',
      upsert: true
    });

  if (uploadError) {
    console.error('❌ Error uploading test file:', uploadError.message);
    process.exit(1);
  }

  console.log('✓ Test file uploaded successfully');

  // Verify public URL
  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(testPath);

  const publicUrl = publicUrlData.publicUrl;
  console.log(`✓ Public URL: ${publicUrl}`);

  // Cleanup test file
  await supabase.storage.from(BUCKET_NAME).remove([testPath]);
  console.log('✓ Test file removed\n');

  // Step 4: Print summary
  console.log('✅ Setup Complete!\n');
  console.log('Next steps:');
  console.log('  1. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in production environment');
  console.log('  2. Deploy backend with new storage code');
  console.log('  3. Test publishing by creating/updating a post');
  console.log('  4. Update frontends to fetch from Supabase Storage URLs\n');
  console.log(`Base URL for artifacts: ${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/\n`);
}

setupStorage().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
