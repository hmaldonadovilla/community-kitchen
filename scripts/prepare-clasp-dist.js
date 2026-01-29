const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'dist');
const distDir = path.join(distRoot, 'apps-script');
const srcConfig = path.join(root, 'appsscript.json');
const destConfig = path.join(distDir, 'appsscript.json');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

if (!fs.existsSync(srcConfig)) {
  console.error('[prepare-clasp-dist] Missing appsscript.json in repo root.');
  process.exit(1);
}

const srcCodePath = path.join(distRoot, 'Code.js');
const destCodePath = path.join(distDir, 'Code.js');
if (!fs.existsSync(srcCodePath)) {
  console.warn('[prepare-clasp-dist] dist/Code.js not found. Run npm run build first.');
} else {
  fs.copyFileSync(srcCodePath, destCodePath);
}

const raw = fs.readFileSync(srcConfig, 'utf8');
fs.writeFileSync(destConfig, raw, 'utf8');
console.info('[prepare-clasp-dist] Wrote dist/apps-script/appsscript.json');
