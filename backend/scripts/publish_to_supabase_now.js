#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const artifactGenerator = require('../storage/artifact-generator');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'prerender';

async function run(siteId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }
  if (!siteId) {
    console.error('Usage: node publish_to_supabase_now.js <siteId>');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const version = `${Date.now()}`;
  console.log(`Generating artifacts for site ${siteId}...`);
  
  // Thumbnail generation disabled — generateArtifacts without thumbnail hooks
  const artifacts = await artifactGenerator.generateArtifacts(siteId);
  console.log('Artifacts generated:', Object.keys(artifacts));

  const uploaded = {};
  for (const [filename, content] of Object.entries(artifacts)) {
    const ext = filename.split('.').pop();
    const baseName = filename.replace(/\.[^.]+$/, '');
    const versionedName = `${baseName}.${version}.${ext}`;
    const storagePath = `${siteId}/${versionedName}`;

    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

    console.log(`Uploading ${filename} -> ${storagePath} (${buffer.length} bytes)`);
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: ext === 'json' ? 'application/json' : 'text/html',
        cacheControl: 'public, max-age=31536000, immutable',
        upsert: true
      });

    if (error) {
      console.error('Upload error for', filename, error.message || error);
      process.exit(2);
    }

    uploaded[filename] = versionedName;
  }

  // Prepare manifest: provide both a map and an array for workflow compatibility
  const filesArray = Object.keys(uploaded).map(k => ({ name: uploaded[k], key: k }));
  const manifest = {
    version,
    filesMap: uploaded,
    files: filesArray,
    updatedAt: Date.now()
  };

  const manifestPath = `${siteId}/manifest.json`;
  console.log('Writing manifest to', manifestPath);
  const { error: manifestError } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(manifestPath, Buffer.from(JSON.stringify(manifest, null, 2)), {
      contentType: 'application/json',
      cacheControl: 'public, max-age=30',
      upsert: true
    });

  if (manifestError) {
    console.error('Manifest upload error:', manifestError.message || manifestError);
    process.exit(3);
  }

  const baseUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${siteId}/`;
  console.log('\nPublish complete:');
  console.log('Version:', version);
  console.log('Files:');
  for (const [k, v] of Object.entries(uploaded)) {
    console.log(` - ${k}: ${baseUrl}${v}`);
  }
  console.log(' - manifest:', `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${siteId}/manifest.json`);
}

const siteIdArg = process.argv[2];
run(siteIdArg).catch(err => {
  console.error('Publish failed:', err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(99);
});
