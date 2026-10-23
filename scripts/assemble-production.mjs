import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function relativePath(input) {
  if (typeof input !== 'string' || !input || input.includes('\\') || input.includes('\0')) {
    throw new Error('Invalid path in sync manifest');
  }
  const normalized = path.posix.normalize(input);
  if (normalized !== input || input.startsWith('/') || input.startsWith('./') ||
      input === '.' || input === '..' || input.startsWith('../') ||
      input.split('/').some(part => !part || part === '.git' || part === 'node_modules')) {
    throw new Error('Unsafe path in sync manifest: ' + input);
  }
  return input;
}

function intersects(a, b) {
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}

function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

async function safeCopy(from, to, relative = null, exclusions = []) {
  if (relative && exclusions.some(item => relative === item || relative.startsWith(item + '/'))) return;
  const stat = await fs.lstat(from);
  if (stat.isSymbolicLink()) throw new Error('Symbolic link refused: ' + from);
  if (stat.isDirectory()) {
    await fs.mkdir(to, { recursive: true });
    for (const name of await fs.readdir(from)) {
      await safeCopy(path.join(from, name), path.join(to, name), relative ? relative + '/' + name : null, exclusions);
    }
  } else if (stat.isFile()) {
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
  } else {
    throw new Error('Unsupported file type: ' + from);
  }
}

async function assertDirectory(dir, title) {
  const stat = await fs.lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(title + ' must be a directory');
  return await fs.realpath(dir);
}

function validateManifest(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.privatePaths) ||
      !Array.isArray(data.publicPaths) || !Array.isArray(data.protectedPaths)) {
    throw new Error('Sync manifest must contain schemaVersion=1 and three path arrays');
  }
  for (const group of ['privatePaths', 'publicPaths', 'protectedPaths']) {
    const paths = data[group].map(relativePath);
    if (new Set(paths).size !== paths.length) throw new Error('Duplicate ' + group + ' entry');
    data[group] = paths;
  }
  if (!data.privatePaths.length || !data.publicPaths.length || !data.protectedPaths.length) {
    throw new Error('Empty path arrays are not allowed');
  }
  for (const item of data.publicPaths) {
    if (data.protectedPaths.some(protectedPath => item === protectedPath || item.startsWith(protectedPath + '/'))) {
      throw new Error('Public update overlaps private-protected path: ' + item);
    }
    if (!data.privatePaths.some(base => intersects(base, item))) {
      throw new Error('Public update outside staged private paths: ' + item);
    }
  }
  return data;
}

/**
 * Assemble production only in a new output directory.
 * The private checkout is authoritative for names, assets and real geography.
 * No GitHub Actions, authentication or deployment is run here.
 */
export async function assembleProduction({ publicRoot = DEFAULT_PUBLIC_ROOT, privateRoot, outputRoot, manifestPath }) {
  if (!privateRoot || !outputRoot) throw new Error('--private and --out are required');
  const publicDir = await assertDirectory(path.resolve(publicRoot), 'Public checkout');
  const privateDir = await assertDirectory(path.resolve(privateRoot), 'Private checkout');
  if (publicDir === privateDir) throw new Error('Public and private checkouts must differ');
  const outputDir = path.resolve(outputRoot);
  if (isWithin(publicDir, outputDir) || isWithin(privateDir, outputDir) ||
      isWithin(outputDir, publicDir) || isWithin(outputDir, privateDir)) {
    throw new Error('Output must be outside both source directories');
  }
  const configFile = path.resolve(manifestPath || path.join(privateDir, 'production-public-sync.json'));
  if (!isWithin(privateDir, configFile)) throw new Error('Manifest must be inside private checkout');
  const manifest = validateManifest(JSON.parse(await fs.readFile(configFile, 'utf8')));

  // Inspect all required paths before creating output. Never overwrite an existing directory.
  for (const item of manifest.privatePaths) await fs.lstat(path.join(privateDir, item));
  for (const item of manifest.publicPaths) await fs.lstat(path.join(publicDir, item));
  for (const item of manifest.protectedPaths) await fs.lstat(path.join(privateDir, item));
  try {
    await fs.lstat(outputDir);
    throw new Error('Output already exists; choose a fresh directory');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(outputDir);
  for (const item of manifest.privatePaths) {
    await safeCopy(path.join(privateDir, item), path.join(outputDir, item));
  }
  for (const item of manifest.publicPaths) {
    await safeCopy(path.join(publicDir, item), path.join(outputDir, item), item, manifest.protectedPaths);
  }
  for (const item of manifest.protectedPaths) {
    const original = path.join(privateDir, item);
    const staged = path.join(outputDir, item);
    const originalStat = await fs.lstat(original);
    const stagedStat = await fs.lstat(staged);
    if (originalStat.isFile() && stagedStat.isFile()) {
      if (!((await fs.readFile(original)).equals(await fs.readFile(staged)))) {
        throw new Error('Protected file changed: ' + item);
      }
    } else if (originalStat.isDirectory() && stagedStat.isDirectory()) {
      // A path-overlap check above guarantees no public update touched this subtree.
    } else {
      throw new Error('Protected path type changed: ' + item);
    }
  }
  return { outputDir, publicPaths: manifest.publicPaths, protectedPaths: manifest.protectedPaths };
}

async function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--private', '--out', '--public', '--manifest'].includes(argv[i]) || !argv[i + 1]) {
      throw new Error('Usage: node scripts/assemble-production.mjs --private PRIVATE_CLONE --out NEW_OUTPUT [--public PUBLIC_CLONE] [--manifest PRIVATE_MANIFEST]');
    }
    args[argv[i].slice(2)] = argv[i + 1];
  }
  const result = await assembleProduction({
    publicRoot: args.public,
    privateRoot: args.private,
    outputRoot: args.out,
    manifestPath: args.manifest
  });
  console.log('Staged production output: ' + result.outputDir);
  console.log('Public code paths: ' + result.publicPaths.join(', '));
  console.log('Private-protected paths: ' + result.protectedPaths.join(', '));
  console.log('No tests or Firebase deployment were executed.');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error('Production assembly refused: ' + error.message);
    process.exitCode = 1;
  });
}
