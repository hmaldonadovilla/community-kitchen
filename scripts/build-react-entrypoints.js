const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const entryDir = path.join(root, 'src', 'web', 'react', 'entrypoints');
const distDir = path.join(root, 'dist');

const toKebabCase = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase();

const listEntrypoints = () => {
  if (!fs.existsSync(entryDir)) return [];
  return fs
    .readdirSync(entryDir)
    .filter((f) => f && typeof f === 'string')
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.jsx'))
    .sort();
};

const cleanupOldBundles = () => {
  if (!fs.existsSync(distDir)) return;
  fs.readdirSync(distDir)
    .filter((f) => f && typeof f === 'string')
    .filter((f) => f.toLowerCase().startsWith('webform-react-') && f.toLowerCase() !== 'webform-react.js')
    .forEach((fileName) => {
      try {
        fs.unlinkSync(path.join(distDir, fileName));
        console.info('[build-react-entrypoints] Removed stale bundle', fileName);
      } catch (_) {
        // ignore cleanup failures
      }
    });
};

const buildEntrypoint = async (fileName) => {
  const fullPath = path.join(entryDir, fileName);
  const base = fileName.replace(/\.[^.]+$/, '');
  const key = toKebabCase(base);
  if (!key) return;
  const outFile = path.join(distDir, `webform-react-${key}.js`);
  await esbuild.build({
    entryPoints: [fullPath],
    bundle: true,
    outfile: outFile,
    format: 'iife',
    target: 'es2019',
    minify: true,
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.css': 'text' }
  });
  console.info('[build-react-entrypoints] Built', fileName, '->', path.basename(outFile));
};

const run = async () => {
  const files = listEntrypoints();
  if (!files.length) {
    console.info('[build-react-entrypoints] No entrypoints found');
    cleanupOldBundles();
    return;
  }
  for (const fileName of files) {
    // eslint-disable-next-line no-await-in-loop
    await buildEntrypoint(fileName);
  }
};

run().catch((err) => {
  console.error('[build-react-entrypoints] Failed', err && err.message ? err.message : err);
  process.exit(1);
});
