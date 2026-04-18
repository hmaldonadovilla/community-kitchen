#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const LINTABLE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx']);
const DEFAULT_LINT_BASE_REF = '7228fc2c7f1f550fa36bf2d7368779ba1adf48d6';
const PROCESS_MAX_BUFFER = 16 * 1024 * 1024;

function runGit(args, options = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: PROCESS_MAX_BUFFER
    }).trimEnd();
  } catch (error) {
    if (options.optional) {
      return '';
    }
    throw error;
  }
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function isLintableFile(filePath) {
  return LINTABLE_EXTENSIONS.has(path.extname(filePath));
}

function ensureLineSet(map, filePath) {
  let lineSet = map.get(filePath);
  if (!lineSet) {
    lineSet = new Set();
    map.set(filePath, lineSet);
  }
  return lineSet;
}

function addDiffHunks(diffText, addedLinesByFile) {
  let currentFile = null;
  const lines = diffText.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      const rawPath = line.slice(4).trim();
      if (!rawPath || rawPath === '/dev/null') {
        currentFile = null;
        continue;
      }
      currentFile = normalizePath(rawPath.startsWith('b/') ? rawPath.slice(2) : rawPath);
      continue;
    }
    if (!currentFile || !line.startsWith('@@')) {
      continue;
    }
    const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) {
      continue;
    }
    const startLine = Number(match[1]);
    const lineCount = match[2] ? Number(match[2]) : 1;
    if (!Number.isFinite(startLine) || !Number.isFinite(lineCount) || lineCount <= 0) {
      continue;
    }
    const lineSet = ensureLineSet(addedLinesByFile, currentFile);
    for (let offset = 0; offset < lineCount; offset += 1) {
      lineSet.add(startLine + offset);
    }
  }
}

function addUntrackedFiles(fileListText, addedLinesByFile) {
  const files = fileListText.split(/\r?\n/).map((filePath) => filePath.trim()).filter(Boolean);
  for (const filePath of files) {
    const normalizedPath = normalizePath(filePath);
    if (!isLintableFile(normalizedPath) || !fs.existsSync(normalizedPath)) {
      continue;
    }
    const content = fs.readFileSync(normalizedPath, 'utf8');
    const lineCount = Math.max(content.split(/\r?\n/).length, 1);
    const lineSet = ensureLineSet(addedLinesByFile, normalizedPath);
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
      lineSet.add(lineNumber);
    }
  }
}

function resolveBaseRef() {
  const candidates = [process.env.LINT_BASE_REF, DEFAULT_LINT_BASE_REF, 'origin/main', 'main'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      runGit(['rev-parse', '--verify', candidate]);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function getChangedLineMap() {
  const changedLines = new Map();
  const baseRef = resolveBaseRef();
  if (baseRef) {
    const mergeBase = runGit(['merge-base', baseRef, 'HEAD']);
    addDiffHunks(runGit(['diff', '--unified=0', '--no-color', `${mergeBase}...HEAD`], { optional: true }), changedLines);
  }
  addDiffHunks(runGit(['diff', '--unified=0', '--no-color', '--cached'], { optional: true }), changedLines);
  addDiffHunks(runGit(['diff', '--unified=0', '--no-color'], { optional: true }), changedLines);
  addUntrackedFiles(runGit(['ls-files', '--others', '--exclude-standard'], { optional: true }), changedLines);
  return { baseRef, changedLines };
}

function hasRelevantLine(message, addedLines) {
  if (!addedLines || addedLines.size === 0) {
    return false;
  }
  if (!message.line || message.line < 1) {
    return true;
  }
  const endLine = message.endLine && message.endLine >= message.line ? message.endLine : message.line;
  for (let lineNumber = message.line; lineNumber <= endLine; lineNumber += 1) {
    if (addedLines.has(lineNumber)) {
      return true;
    }
  }
  return false;
}

function formatMessage(filePath, message) {
  const line = message.line || 1;
  const column = message.column || 1;
  const severity = message.severity === 2 ? 'error' : 'warning';
  const ruleId = message.ruleId || 'eslint';
  return `${filePath}:${line}:${column} ${severity} ${ruleId} ${message.message}`;
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  const repoRoot = runGit(['rev-parse', '--show-toplevel']);
  process.chdir(repoRoot);

  const { baseRef, changedLines } = getChangedLineMap();
  const changedLintableFiles = Array.from(changedLines.keys())
    .filter(isLintableFile)
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
  if (changedLintableFiles.length === 0) {
    console.log('No changed lintable files found.');
    return;
  }

  console.log(
    baseRef
      ? `Linting added lines in ${changedLintableFiles.length} changed file(s) against ${baseRef}.`
      : `Linting added lines in ${changedLintableFiles.length} changed file(s).`
  );

  const eslintCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const eslintResult = spawnSync(
    eslintCommand,
    ['eslint', '--format', 'json', '--no-warn-ignored', ...changedLintableFiles],
    {
      encoding: 'utf8',
      shell: false,
      maxBuffer: PROCESS_MAX_BUFFER
    }
  );

  if (eslintResult.error) {
    throw eslintResult.error;
  }
  if (eslintResult.stderr) {
    process.stderr.write(eslintResult.stderr);
  }
  if (eslintResult.status !== 0 && eslintResult.status !== 1) {
    process.stdout.write(eslintResult.stdout || '');
    process.exit(eslintResult.status || 1);
  }

  const eslintOutput = (eslintResult.stdout || '').trim();
  const results = eslintOutput ? JSON.parse(eslintOutput) : [];
  const relevantMessages = [];
  for (const result of results) {
    const relativeFilePath = normalizePath(path.relative(repoRoot, result.filePath));
    const addedLines = changedLines.get(relativeFilePath);
    if (!addedLines || addedLines.size === 0) {
      continue;
    }
    for (const message of result.messages) {
      if (hasRelevantLine(message, addedLines)) {
        relevantMessages.push(formatMessage(relativeFilePath, message));
      }
    }
  }

  if (relevantMessages.length > 0) {
    console.error('New lint issues found on added lines:');
    for (const message of relevantMessages) {
      console.error(message);
    }
    process.exit(1);
  }

  console.log('No new ESLint issues found on added lines.');
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  runCommand(npmCommand, ['run', 'lint:types'], 'TypeScript typecheck');
}

main();
