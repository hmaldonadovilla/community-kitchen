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
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #111; }
    .shell { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #d0d0d0; }
    h1 { margin: 0; font-size: 1.25rem; line-height: 1.3; font-weight: 600; }
    main { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 12px; padding: 14px 12px max(18px, env(safe-area-inset-bottom)); }
    .instruction { margin: 0; font-size: 1rem; line-height: 1.45; }
    .status { min-height: 1.4em; margin: 0; color: #555; font-size: 0.9rem; line-height: 1.4; }
    .status[data-tone="success"] { color: #137333; }
    .status[data-tone="error"] { color: #b3261e; }
    .preview { background: #777; border-radius: 8px; overflow: hidden; height: min(48vh, 390px); height: min(48dvh, 390px); min-height: 210px; display: flex; align-items: center; justify-content: center; }
    video { width: 100%; height: 100%; object-fit: cover; display: block; }
    button { min-height: 44px; border: 1px solid #aaa; border-radius: 8px; background: #fff; color: #111; font: inherit; font-weight: 600; padding: 10px 14px; }
    button[hidden] { display: none; }
    button:disabled { cursor: not-allowed; opacity: 0.5; }
    .primary { border-color: #0b57d0; background: #0b57d0; color: #fff; }
    .results { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 8px; }
    .results-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    h2 { margin: 0; font-size: 1rem; line-height: 1.4; font-weight: 600; }
    .candidate-summary { margin: 0; color: #555; font-size: 0.85rem; line-height: 1.4; text-align: right; }
    .candidate-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; list-style: none; margin: 0; padding: 0; }
    .candidate { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid #d0d0d0; border-radius: 8px; padding: 10px 12px; }
    .candidate[data-status="error"], .candidate[data-status="rejected"] { border-color: #b3261e; }
    .candidate-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
    .candidate-name { overflow: hidden; font-size: 0.95rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .candidate-message { color: #555; font-size: 0.85rem; line-height: 1.35; }
    .candidate[data-status="error"] .candidate-message, .candidate[data-status="rejected"] .candidate-message { color: #b3261e; }
    .candidate-status { flex: 0 0 auto; color: #555; font-size: 0.8rem; font-weight: 500; text-align: right; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }
    @media (max-height: 650px) {
      .preview { height: min(40vh, 300px); min-height: 170px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>Scan QR code</h1>
      <button type="button" data-action="cancel" hidden>Close</button>
    </header>
    <main>
      <p class="instruction" data-role="instruction">Point the camera at each receipt QR code.</p>
      <div class="preview">
        <video data-role="video" muted playsinline autoplay></video>
      </div>
      <p class="status" data-role="status" role="status" aria-live="polite">Starting camera...</p>
      <section class="results" aria-labelledby="scanned-receipts-heading">
        <div class="results-heading">
          <h2 id="scanned-receipts-heading">Scanned receipts</h2>
          <p class="candidate-summary" data-role="candidate-summary">No receipts scanned yet.</p>
        </div>
        <ul class="candidate-list" data-role="candidate-list" aria-live="polite"></ul>
      </section>
      <div class="actions">
        <button type="button" class="primary" data-action="finish" disabled>Finish and add receipts</button>
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
