const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const firebaseAssetsDir = path.join(distDir, 'firebase-hosting', 'assets');
const IOS_15_UNSUPPORTED_REGEX_TOKENS = [
  { token: '(?<=', label: 'positive regular-expression lookbehind' },
  { token: '(?<!', label: 'negative regular-expression lookbehind' }
];

const findUnsupportedRegexSyntax = (source) => {
  const text = (source || '').toString();
  const findings = [];
  IOS_15_UNSUPPORTED_REGEX_TOKENS.forEach(({ token, label }) => {
    let fromIndex = 0;
    let index = text.indexOf(token, fromIndex);
    while (index >= 0) {
      findings.push({ index, token, label });
      fromIndex = index + token.length;
      index = text.indexOf(token, fromIndex);
    }
  });
  return findings.sort((left, right) => left.index - right.index);
};

const listBrowserBundles = () => {
  const files = [];
  if (fs.existsSync(distDir)) {
    fs.readdirSync(distDir)
      .filter(fileName => /^webform-react(?:-[a-z0-9-]+)?\.js$/i.test(fileName))
      .sort()
      .forEach(fileName => files.push(path.join(distDir, fileName)));
  }
  if (fs.existsSync(firebaseAssetsDir)) {
    fs.readdirSync(firebaseAssetsDir)
      .filter(fileName => /^qr-scanner\.[a-f0-9]+\.js$/i.test(fileName))
      .sort()
      .forEach(fileName => files.push(path.join(firebaseAssetsDir, fileName)));
  }
  return files;
};

const run = () => {
  const files = listBrowserBundles();
  if (!files.length) {
    console.error('[browser-compat] No browser bundles found. Run the web build first.');
    process.exitCode = 1;
    return;
  }

  const violations = [];
  files.forEach(filePath => {
    const source = fs.readFileSync(filePath, 'utf8');
    findUnsupportedRegexSyntax(source).forEach(finding => {
      violations.push({ filePath, ...finding });
    });
  });

  if (violations.length) {
    violations.forEach(({ filePath, index, label }) => {
      console.error(`[browser-compat] ${path.relative(root, filePath)}:${index} contains ${label}.`);
    });
    console.error('[browser-compat] These expressions prevent the application bundle from loading in iOS 15 Safari.');
    process.exitCode = 1;
    return;
  }

  console.info(`[browser-compat] ${files.length} browser bundle(s) passed the iOS 15 regex syntax check.`);
};

if (require.main === module) run();

module.exports = {
  findUnsupportedRegexSyntax,
  listBrowserBundles,
  run
};
