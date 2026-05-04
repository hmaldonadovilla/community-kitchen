const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const readFlag = name => {
  const direct = args.find(arg => arg.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
  return '';
};

const normalizeEnvName = value => {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return '';
  return raw === 'production' ? 'prod' : raw;
};

const detectSingleEnvName = () => {
  const files = fs
    .readdirSync(root)
    .filter(name => /^\.env\.gcp\.[^.]+$/.test(name))
    .filter(name => name !== '.env.gcp.example');
  if (files.length !== 1) return '';
  return normalizeEnvName(files[0].replace(/^\.env\.gcp\./, ''));
};

const envName = normalizeEnvName(
  readFlag('env') ||
    readFlag('deploy-env') ||
    process.env.DEPLOY_ENV ||
    process.env.CK_ENV ||
    process.env.CK_CONFIG_ENV ||
    detectSingleEnvName()
) || 'default';

const sourceDir = path.resolve(root, readFlag('source-dir') || process.env.GCP_CLOUD_RUN_SOURCE_DIR || 'cloud-run/api');
const configDir = path.resolve(root, readFlag('config-dir') || path.join('docs/config/exports', envName));
const generatedDir = path.join(sourceDir, 'generated');

const bundleFormConfigs = () => {
  if (!fs.existsSync(configDir)) {
    console.warn(`[cloud-run-assets] Config export directory not found: ${configDir}`);
    return;
  }
  const files = fs
    .readdirSync(configDir)
    .filter(name => name.endsWith('.json'))
    .filter(name => name.toLowerCase() !== 'landing_page.json')
    .filter(name => name.toLowerCase() !== 'analytics_page.json')
    .sort();
  const forms = files.map(name => JSON.parse(fs.readFileSync(path.join(configDir, name), 'utf8')));
  fs.mkdirSync(generatedDir, { recursive: true });
  const outputFile = path.join(generatedDir, 'formConfigs.json');
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      {
        env: envName || null,
        generatedAt: new Date().toISOString(),
        sourceDir: path.relative(root, configDir),
        forms
      },
      null,
      2
    )
  );
  console.info(`[cloud-run-assets] Bundled ${forms.length} form config(s) into ${path.relative(root, outputFile)}`);
};

const bundleAnalyticsPageConfig = () => {
  fs.mkdirSync(generatedDir, { recursive: true });
  const inputFile = path.join(configDir, 'analytics_page.json');
  const outputFile = path.join(generatedDir, 'analyticsPageConfig.json');
  let config = null;
  let sourceFile = '';
  if (fs.existsSync(inputFile)) {
    config = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    sourceFile = path.relative(root, inputFile);
  }
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      {
        env: envName || null,
        generatedAt: new Date().toISOString(),
        sourceFile: sourceFile || null,
        config
      },
      null,
      2
    )
  );
  console.info(`[cloud-run-assets] Bundled analytics page config into ${path.relative(root, outputFile)}`);
};

const bundleTemplateRenderers = () => {
  childProcess.execFileSync(process.execPath, [path.join(root, 'scripts', 'embed-html-templates.js')], {
    cwd: root,
    stdio: 'inherit'
  });

  fs.mkdirSync(generatedDir, { recursive: true });
  const entryFile = path.join(generatedDir, '.templateRendererEntry.ts');
  const outputFile = path.join(generatedDir, 'templateRenderers.cjs');
  fs.writeFileSync(
    entryFile,
    [
      "export { renderHtmlFromHtmlTemplate } from '../../../src/services/webform/followup/htmlRenderer';",
      "export { renderMarkdownFromTemplate } from '../../../src/services/webform/followup/markdownRenderer';",
      "export { resolveTemplateId, resolveLocalizedStringValue } from '../../../src/services/webform/followup/recipients';",
      "export { addConsolidatedPlaceholders, addLabelPlaceholders, buildPlaceholderMap, collectLineItemRows } from '../../../src/services/webform/followup/placeholders';",
      "export { addPlaceholderVariants, applyPlaceholders } from '../../../src/services/webform/followup/utils';",
      "export { collectValidationWarnings } from '../../../src/services/webform/followup/validation';"
    ].join('\n'),
    'utf8'
  );
  try {
    esbuild.buildSync({
      entryPoints: [entryFile],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      outfile: outputFile,
      logLevel: 'silent'
    });
    console.info(`[cloud-run-assets] Bundled template renderer into ${path.relative(root, outputFile)}`);
  } finally {
    try {
      fs.unlinkSync(entryFile);
    } catch {
      // ignore cleanup failures
    }
  }
};

const bundleAnalyticsEvaluator = () => {
  fs.mkdirSync(generatedDir, { recursive: true });
  const entryFile = path.join(generatedDir, '.analyticsEvaluatorEntry.ts');
  const outputFile = path.join(generatedDir, 'analyticsEvaluator.cjs');
  fs.writeFileSync(
    entryFile,
    [
      "export { evaluateAnalyticsWidgets } from '../../../src/services/webform/analytics/engine';"
    ].join('\n'),
    'utf8'
  );
  try {
    esbuild.buildSync({
      entryPoints: [entryFile],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      outfile: outputFile,
      logLevel: 'silent'
    });
    console.info(`[cloud-run-assets] Bundled analytics evaluator into ${path.relative(root, outputFile)}`);
  } finally {
    try {
      fs.unlinkSync(entryFile);
    } catch {
      // ignore cleanup failures
    }
  }
};

bundleFormConfigs();
bundleAnalyticsPageConfig();
bundleTemplateRenderers();
bundleAnalyticsEvaluator();
