import { promises as fs, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { integrateGameHtml } from './production-html.mjs';

function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') ||
      value.startsWith('/') || path.posix.normalize(value) !== value ||
      value.split('/').some(x => !x || x === '..' || x === '.' || x === '.git' || x === 'node_modules')) {
    throw new Error('Unsafe manifest path');
  }
  return value;
}

async function directory(root) {
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Expected a regular directory');
  return fs.realpath(root);
}

function child(root, relative) {
  const dest = path.resolve(root, relative);
  const rel = path.relative(root, dest);
  if (!rel || rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) {
    throw new Error('Unsafe child path');
  }
  return dest;
}

async function digest(file) {
  const h = createHash('sha256');
  for await (const block of createReadStream(file)) h.update(block);
  return h.digest('hex');
}

async function compareTrees(expected, actual, relative, counters, type, skip = () => false) {
  if (skip(relative)) return;
  const a = await fs.lstat(expected);
  const b = await fs.lstat(actual);
  if (a.isSymbolicLink() || b.isSymbolicLink()) throw new Error('Symlink refused: ' + relative);
  if (a.isFile() && b.isFile()) {
    if (a.size !== b.size || (await digest(expected)) !== (await digest(actual))) {
      throw new Error('Production integrity mismatch: ' + relative);
    }
    counters[type] += 1;
    return;
  }
  if (a.isDirectory() && b.isDirectory()) {
    const names = (await fs.readdir(expected)).sort();
    if (type === 'protected') {
      const actualNames = (await fs.readdir(actual)).sort();
      if (JSON.stringify(names) !== JSON.stringify(actualNames)) {
        throw new Error('Protected directory entries changed: ' + relative);
      }
    }
    for (const name of names) {
      await compareTrees(path.join(expected, name), path.join(actual, name),
        relative + '/' + name, counters, type, skip);
    }
    return;
  }
  throw new Error('Production file type mismatch: ' + relative);
}

/**
 * Independently verifies an assembled site without writing any files.
 * Checks the full private-protected subtrees and every permitted public-code file.
 * Prints counts only on success; never sends private assets to public CI.
 */
export async function verifyProductionOverlay({ privateRoot, publicRoot, siteRoot }) {
  if (!privateRoot || !publicRoot || !siteRoot) throw new Error('Private, public and site paths required');
  const [privateDir, publicDir, siteDir] = await Promise.all(
    [privateRoot, publicRoot, siteRoot].map(x => directory(path.resolve(x)))
  );
  if (new Set([privateDir, publicDir, siteDir]).size !== 3) {
    throw new Error('Private, public and site directories must be distinct');
  }
  const manifest = JSON.parse(await fs.readFile(path.join(privateDir, 'production-public-sync.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.protectedPaths) || !Array.isArray(manifest.publicPaths) ||
      !Array.isArray(manifest.privatePaths)) {
    throw new Error('Invalid production sync manifest');
  }
  for (const group of ['privatePaths', 'publicPaths', 'protectedPaths']) {
    manifest[group] = manifest[group].map(safeRelative);
  }
  const counters = { protected: 0, public: 0 };
  const integratedHtml = manifest.protectedPaths.includes('index.html') && manifest.publicPaths.includes('src') && manifest.publicPaths.includes('lib');
  if(integratedHtml){
    const expected=integrateGameHtml(await fs.readFile(path.join(privateDir,'index.html'),'utf8'),await fs.readFile(path.join(publicDir,'index.html'),'utf8'));
    if((await fs.readFile(path.join(siteDir,'index.html'),'utf8'))!==expected)throw Error('Integrated game HTML mismatch');
    counters.protected++;
  }
  for (const relative of manifest.protectedPaths) {
    if(integratedHtml && relative==='index.html')continue;
    await compareTrees(child(privateDir, relative), child(siteDir, relative),
      relative, counters, 'protected');
  }
  const isProtected = relative => manifest.protectedPaths.some(
    item => relative === item || relative.startsWith(item + '/')
  );
  for (const relative of manifest.publicPaths) {
    if (isProtected(relative)) throw new Error('Public path overlaps protected path: ' + relative);
    await compareTrees(child(publicDir, relative), child(siteDir, relative),
      relative, counters, 'public', isProtected);
  }
  return { status: 'PASS', protectedFiles: counters.protected, publicCodeFiles: counters.public };
}

async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--private', '--public', '--site'].includes(args[i]) || !args[i + 1]) {
      throw new Error('Usage: node scripts/verify-production-overlay.mjs --private PRIVATE --public PUBLIC --site ASSEMBLED');
    }
    options[args[i].slice(2)] = args[i + 1];
  }
  const result = await verifyProductionOverlay({
    privateRoot: options.private, publicRoot: options.public, siteRoot: options.site
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error('Production verification FAILED: ' + error.message);
    process.exitCode = 1;
  });
}
