import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assembleProduction } from './assemble-production.mjs';
import { verifyProductionOverlay } from './verify-production-overlay.mjs';

const DEFAULT_PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FULL_SHA = /^[0-9a-f]{40}$/i;

export function parseArguments(argv) {
  const options = { build: false, keep: false };
  const paths = new Map([
    ['--private', 'privateRoot'],
    ['--public', 'publicRoot'],
    ['--out', 'outputRoot'],
    ['--public-sha', 'expectedPublicSha'],
    ['--private-sha', 'expectedPrivateSha']
  ]);
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag)) throw new Error('Duplicate option: ' + flag);
    seen.add(flag);
    if (flag === '--help') { options.help = true; continue; }
    if (flag === '--build') { options.build = true; continue; }
    if (flag === '--keep') { options.keep = true; continue; }
    const key = paths.get(flag);
    if (!key || !argv[i + 1] || argv[i + 1].startsWith('--')) {
      throw new Error('Invalid option or missing value: ' + flag);
    }
    options[key] = argv[++i];
  }
  if (!options.help && !options.privateRoot) throw new Error('--private is required');
  for (const key of ['expectedPublicSha', 'expectedPrivateSha']) {
    if (options[key] && !FULL_SHA.test(options[key])) {
      throw new Error(key + ' must be a full 40-character commit SHA');
    }
  }
  return options;
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function checkGitReference(root, label, expected) {
  const actual = git(root, ['rev-parse', 'HEAD']);
  if (expected) {
    if (!actual) throw new Error(label + ' checkout is not a Git repository');
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(label + ' SHA mismatch: expected ' + expected + ', got ' + actual);
    }
    const dirty = git(root, ['status', '--porcelain', '--untracked-files=all']);
    if (dirty === null || dirty) {
      throw new Error(label + ' checkout is not clean; a pinned build must use committed files');
    }
  }
  return actual;
}

/**
 * Assemble and verify without modifying either checkout, running PRIVATE Actions,
 * touching DreamCore, or deploying Firebase Hosting.
 */
export async function prepareIntegrated({
  publicRoot = DEFAULT_PUBLIC,
  privateRoot,
  outputRoot,
  expectedPublicSha,
  expectedPrivateSha
}) {
  if (!privateRoot) throw new Error('privateRoot is required');
  const publicDir = path.resolve(publicRoot);
  const privateDir = path.resolve(privateRoot);
  const publicSha = checkGitReference(publicDir, 'PUBLIC', expectedPublicSha);
  const privateSha = checkGitReference(privateDir, 'PRIVATE', expectedPrivateSha);
  const temporaryRoot = outputRoot ? null :
    await fs.mkdtemp(path.join(os.tmpdir(), 'michitanken-dev-'));
  const siteRoot = outputRoot ? path.resolve(outputRoot) : path.join(temporaryRoot, 'site');
  try {
    await assembleProduction({ publicRoot: publicDir, privateRoot: privateDir, outputRoot: siteRoot });
    const verification = await verifyProductionOverlay({
      publicRoot: publicDir, privateRoot: privateDir, siteRoot
    });
    return { siteRoot, temporaryRoot, publicSha, privateSha, verification };
  } catch (error) {
    if (temporaryRoot) error.message += ' (diagnostic files: ' + temporaryRoot + ')';
    throw error;
  }
}

function npm(siteRoot, args) {
  const result = spawnSync('npm', args, { cwd: siteRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('npm ' + args.join(' ') + ' failed');
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log('Usage: npm run integrated -- --private PRIVATE_CHECKOUT [--public PUBLIC_CHECKOUT] [--out NEW_OUTPUT] [--build] [--keep] [--public-sha FULL_SHA] [--private-sha FULL_SHA]');
    console.log('Default: quick assembly and protection check. --build: additionally install dependencies and build the actual private-data game.');
    return;
  }
  const result = await prepareIntegrated(options);
  console.log('Integrated protection check PASS: ' + JSON.stringify(result.verification));
  console.log('PUBLIC HEAD: ' + (result.publicSha || 'unavailable') +
    '; PRIVATE HEAD: ' + (result.privateSha || 'unavailable'));
  if (!options.expectedPublicSha || !options.expectedPrivateSha) {
    console.log('Development mode: source commits are not fully pinned; do not use this output as a release artifact.');
  }
  if (options.build) {
    const hasLock = await fs.access(path.join(result.siteRoot, 'package-lock.json'))
      .then(() => true, () => false);
    if (!hasLock) {
      console.log('No package-lock.json in PRIVATE overlay: dependency resolution is not release-reproducible.');
    }
    npm(result.siteRoot, [hasLock ? 'ci' : 'install', '--no-audit', '--no-fund']);
    npm(result.siteRoot, ['run', 'build', '--', '--base=/games/michitanken/']);
    console.log('Integrated Vite build PASS: ' + path.join(result.siteRoot, 'dist'));
  }
  if (result.temporaryRoot && !options.build && !options.keep) {
    await fs.rm(result.temporaryRoot, { recursive: true });
    console.log('Temporary check output removed. Use --keep or --out to retain it.');
  } else {
    console.log('Output retained: ' + result.siteRoot);
  }
  console.log('No DreamCore changes, PRIVATE Actions, PR merge, or Firebase deploy.');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error('Integrated development check FAILED: ' + error.message);
    process.exitCode = 1;
  });
}
