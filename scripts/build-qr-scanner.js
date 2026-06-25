const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const entryPoint = path.join(root, 'src', 'web', 'qrScanner', 'standalone.ts');
const hostingDir = path.join(root, 'dist', 'firebase-hosting');
const assetsDir = path.join(hostingDir, 'assets');
const manifestPath = path.join(hostingDir, 'asset-manifest.json');

const updateManifest = (entry) => {
  if (!fs.existsSync(manifestPath)) return;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);
    manifest.qrScanner = entry;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn('[build-qr-scanner] Could not update asset manifest:', err && err.message ? err.message : err);
  }
};

const htmlFor = (scriptFileName) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Scan QR code</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #fff; color: #111; }
    .shell { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #d0d0d0; }
    h1 { margin: 0; font-size: 1.25rem; font-weight: 650; }
    main { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 12px; padding: 12px 12px max(16px, env(safe-area-inset-bottom)); }
    .status { min-height: 1.5em; color: #555; font-size: 0.95rem; }
    .status.success { color: #137333; font-weight: 700; }
    .preview { background: #777; border-radius: 8px; overflow: hidden; height: min(58vh, 430px); height: min(58dvh, 430px); min-height: 220px; display: flex; align-items: center; justify-content: center; }
    video { width: 100%; height: 100%; object-fit: cover; display: block; }
    button { min-height: 44px; border: 1px solid #aaa; border-radius: 8px; background: #fff; color: #111; font: inherit; font-weight: 600; padding: 10px 14px; }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>Scan QR code</h1>
      <button type="button" data-action="close">Close</button>
    </header>
    <main>
      <div class="status" data-role="status">Starting camera...</div>
      <div class="preview">
        <video data-role="video" muted playsinline autoplay></video>
      </div>
    </main>
  </div>
  <script defer src="/${scriptFileName}"></script>
</body>
</html>
`;

(async () => {
  fs.mkdirSync(assetsDir, { recursive: true });
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    target: 'es2019',
    minify: true,
    write: false
  });
  const output = result.outputFiles && result.outputFiles[0] ? result.outputFiles[0].text : '';
  if (!output) {
    throw new Error('QR scanner bundle output was empty.');
  }

  const hash = crypto.createHash('sha256').update(output, 'utf8').digest('hex').slice(0, 12);
  const scriptFileName = `assets/qr-scanner.${hash}.js`;
  fs.readdirSync(assetsDir)
    .filter(name => /^qr-scanner\.[a-f0-9]+\.js$/.test(name) && name !== path.basename(scriptFileName))
    .forEach(name => fs.rmSync(path.join(assetsDir, name), { force: true }));
  fs.writeFileSync(path.join(hostingDir, scriptFileName), output, 'utf8');
  fs.writeFileSync(path.join(hostingDir, 'qr-scanner.html'), htmlFor(scriptFileName), 'utf8');
  updateManifest({
    fileName: 'qr-scanner.html',
    scriptFileName,
    hash,
    bytes: Buffer.byteLength(output, 'utf8')
  });
  console.info('[build-qr-scanner] Wrote Firebase QR scanner page to', path.join(hostingDir, 'qr-scanner.html'));
})().catch(err => {
  console.error('[build-qr-scanner] Failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
