#!/usr/bin/env node
/**
 * Simple bundle size guard:
 * - Warn when dist/Code.js.gz exceeds 1 MB
 * - Fail when dist/Code.js.gz exceeds 1.2 MB
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WARN_GZIP_BYTES = 1_000_000; // ~1.0 MB
const MAX_GZIP_BYTES = 1_200_000; // ~1.2 MB

const TARGET_FILE = path.resolve(__dirname, '..', 'dist', 'Code.js');

const fmt = bytes => `${(bytes / 1024).toFixed(1)} kB`;

function main() {
  if (!fs.existsSync(TARGET_FILE)) {
    console.warn('[bundle-size] dist/Code.js not found; skipping size check.');
    return;
  }

  const raw = fs.readFileSync(TARGET_FILE);
  const gz = zlib.gzipSync(raw);

  const rawBytes = raw.length;
  const gzipBytes = gz.length;

  console.log(
    `[bundle-size] dist/Code.js -> raw ${fmt(rawBytes)}, gzip ${fmt(gzipBytes)}`
  );

  if (gzipBytes > MAX_GZIP_BYTES) {
    throw new Error(
      `[bundle-size] dist/Code.js gzipped output (${fmt(
        gzipBytes
      )}) exceeds the ${fmt(MAX_GZIP_BYTES)} hard limit.`
    );
  }

  if (gzipBytes > WARN_GZIP_BYTES) {
    console.warn(
      `[bundle-size] Warning: dist/Code.js gzipped output (${fmt(
        gzipBytes
      )}) is above the ${fmt(WARN_GZIP_BYTES)} warning threshold.`
    );
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

