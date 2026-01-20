#!/usr/bin/env node
/**
 * Script to create and configure the 'thumbnails' bucket in Supabase Storage
 * 
 * This bucket will store optimized thumbnail images (320-480px WebP)
 * for LCP optimization in the frontend
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = 'thumbnails';

async function createThumbnailsBucket() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log(`\n🔍 Checking if bucket '${BUCKET_NAME}' exists...`);

  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('❌ Error listing buckets:', listError.message);
    process.exit(1);
  }

  const bucketExists = buckets.some(b => b.name === BUCKET_NAME);

  if (bucketExists) {
    console.log(`✅ Bucket '${BUCKET_NAME}' already exists`);
  } else {
    console.log(`📦 Creating bucket '${BUCKET_NAME}'...`);
    
    const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/avif'
      ]
    });

    if (error) {
      console.error('❌ Error creating bucket:', error.message);
      process.exit(1);
    }

    console.log(`✅ Bucket '${BUCKET_NAME}' created successfully`);
  }

  // Test upload
  console.log('\n🧪 Testing image upload...');
  
  const testImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  
  const testPath = `test/test-${Date.now()}.png`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(testPath, testImageBuffer, {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
      upsert: true
    });

  if (uploadError) {
    console.error('❌ Test upload failed:', uploadError.message);
    console.error('   This might indicate bucket permissions or MIME type restrictions');
    process.exit(1);
  }

  console.log('✅ Test upload successful');

  // Clean up test file
  await supabase.storage.from(BUCKET_NAME).remove([testPath]);
  console.log('🧹 Test file cleaned up');

  // Get bucket info
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}`;
  console.log(`\n📍 Bucket URL: ${publicUrl}`);
  console.log(`✅ Bucket '${BUCKET_NAME}' is ready for use\n`);
}

createThumbnailsBucket().catch(err => {
  console.error('❌ Script failed:', err.message);
  process.exit(1);
});
