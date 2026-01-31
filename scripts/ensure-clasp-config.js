const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targetPath = path.join(root, '.clasp.json');
const forceRewrite = process.env.CLASP_FORCE_REWRITE === '1';

if (fs.existsSync(targetPath) && !forceRewrite) {
  console.info('[ensure-clasp-config] Using existing .clasp.json');
  process.exit(0);
}

const scriptId = process.env.CLASP_SCRIPT_ID;
if (!scriptId || !scriptId.toString().trim()) {
  console.error('[ensure-clasp-config] Missing CLASP_SCRIPT_ID env var and no .clasp.json found.');
  process.exit(1);
}

const payload = {
  scriptId: scriptId.toString().trim(),
  rootDir: 'dist/apps-script'
};

fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.info('[ensure-clasp-config] Wrote .clasp.json');
