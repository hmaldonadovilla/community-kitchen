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
let manifest = JSON.parse(raw);

const webappAccess = (process.env.CLASP_WEBAPP_ACCESS || '').toString().trim();
const webappExecuteAs = (process.env.CLASP_WEBAPP_EXECUTE_AS || '').toString().trim();
if (webappAccess || webappExecuteAs) {
  if (!webappAccess || !webappExecuteAs) {
    console.error('[prepare-clasp-dist] Both CLASP_WEBAPP_ACCESS and CLASP_WEBAPP_EXECUTE_AS are required when one is set.');
    process.exit(1);
  }
  manifest = {
    ...manifest,
    webapp: {
      access: webappAccess,
      executeAs: webappExecuteAs
    }
  };
  console.info(
    `[prepare-clasp-dist] Applied webapp config access=${webappAccess} executeAs=${webappExecuteAs}`
  );
}

fs.writeFileSync(destConfig, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.info('[prepare-clasp-dist] Wrote dist/apps-script/appsscript.json');
