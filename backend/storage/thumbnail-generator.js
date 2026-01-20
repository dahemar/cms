/**
 * Thumbnail Generation Module
 * 
 * Generates optimized thumbnails for images using sharp
 * Supports local files and remote URLs
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');
const https = require('https');
const http = require('http');

const THUMBNAIL_WIDTH = 480; // LCP-optimized width
const THUMBNAIL_QUALITY = 80;

/**
 * Download image from URL to buffer
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Generate thumbnail from local file or URL
 * @param {string} sourcePath - Local file path or URL
 * @param {string} outputPath - Output file path
 * @param {object} options - { width, quality, format }
 * @returns {Promise<{ path: string, width: number, height: number, size: number }>}
 */
async function generateThumbnail(sourcePath, outputPath, options = {}) {
  const width = options.width || THUMBNAIL_WIDTH;
  const quality = options.quality || THUMBNAIL_QUALITY;
  const format = options.format || 'webp';

  try {
    let inputBuffer;
    
    // Check if source is URL or local file
    if (/^https?:\/\//.test(sourcePath)) {
      console.log(`[Thumbnail] Downloading ${sourcePath}...`);
      inputBuffer = await downloadImage(sourcePath);
    } else {
      // Local file
      const fullPath = path.resolve(sourcePath);
      inputBuffer = await fs.readFile(fullPath);
    }

    // Generate thumbnail
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    
    let processor = image.resize(width, null, {
      fit: 'inside',
      withoutEnlargement: true
    });

    // Apply format-specific options
    if (format === 'webp') {
      processor = processor.webp({ quality });
    } else if (format === 'jpeg' || format === 'jpg') {
      processor = processor.jpeg({ quality, mozjpeg: true });
    } else if (format === 'png') {
      processor = processor.png({ quality: Math.round(quality / 10) });
    }

    const outputBuffer = await processor.toBuffer();
    
    // Write to output
    await fs.writeFile(outputPath, outputBuffer);
    
    const outputMetadata = await sharp(outputBuffer).metadata();
    
    console.log(`[Thumbnail] Generated: ${outputPath} (${metadata.width}x${metadata.height} → ${outputMetadata.width}x${outputMetadata.height}, ${outputBuffer.length} bytes)`);
    
    return {
      path: outputPath,
      width: outputMetadata.width,
      height: outputMetadata.height,
      size: outputBuffer.length,
      format: outputMetadata.format
    };
  } catch (err) {
    console.error(`[Thumbnail] Error generating thumbnail for ${sourcePath}:`, err.message);
    throw err;
  }
}

/**
 * Generate thumbnail in memory and return buffer
 * @param {string} sourcePath - Local file path or URL
 * @param {object} options - { width, quality, format }
 * @returns {Promise<{ buffer: Buffer, width: number, height: number }>}
 */
async function generateThumbnailBuffer(sourcePath, options = {}) {
  const width = options.width || THUMBNAIL_WIDTH;
  const quality = options.quality || THUMBNAIL_QUALITY;
  const format = options.format || 'webp';

  try {
    let inputBuffer;
    
    if (/^https?:\/\//.test(sourcePath)) {
      inputBuffer = await downloadImage(sourcePath);
    } else {
      const fullPath = path.resolve(sourcePath);
      inputBuffer = await fs.readFile(fullPath);
    }

    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    
    let processor = image.resize(width, null, {
      fit: 'inside',
      withoutEnlargement: true
    });

    if (format === 'webp') {
      processor = processor.webp({ quality });
    } else if (format === 'jpeg' || format === 'jpg') {
      processor = processor.jpeg({ quality, mozjpeg: true });
    } else if (format === 'png') {
      processor = processor.png({ quality: Math.round(quality / 10) });
    }

    const outputBuffer = await processor.toBuffer();
    const outputMetadata = await sharp(outputBuffer).metadata();
    
    return {
      buffer: outputBuffer,
      width: outputMetadata.width,
      height: outputMetadata.height,
      size: outputBuffer.length,
      format: outputMetadata.format
    };
  } catch (err) {
    console.error(`[Thumbnail] Error generating thumbnail buffer for ${sourcePath}:`, err.message);
    throw err;
  }
}

/**
 * Generate thumbnails for a batch of images
 * @param {Array<{source: string, output: string}>} images
 * @param {object} options
 * @returns {Promise<Array>}
 */
async function generateThumbnailBatch(images, options = {}) {
  const results = [];
  
  for (const { source, output } of images) {
    try {
      const result = await generateThumbnail(source, output, options);
      results.push({ source, output, ...result, success: true });
    } catch (err) {
      results.push({ source, output, success: false, error: err.message });
    }
  }
  
  return results;
}

module.exports = {
  generateThumbnail,
  generateThumbnailBuffer,
  generateThumbnailBatch,
  THUMBNAIL_WIDTH,
  THUMBNAIL_QUALITY
};
