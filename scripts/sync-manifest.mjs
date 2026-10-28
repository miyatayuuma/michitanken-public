import { promises as fs } from 'node:fs';
import path from 'node:path';

export function relativePath(input) {
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

export function intersects(a, b) {
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}

export function isProtected(relative, manifest) {
  return manifest.protectedPaths.some(item => relative === item || relative.startsWith(item + '/'));
}

function sameList(actual, expected) {
  return actual.length === expected.length &&
    actual.every((value, i) => value === expected[i]);
}

export function validateSyncManifest(raw) {
  if (!raw || ![1, 2].includes(raw.schemaVersion) ||
      !Array.isArray(raw.privatePaths) || !Array.isArray(raw.publicPaths) ||
      !Array.isArray(raw.protectedPaths)) {
    throw new Error('Sync manifest requires schemaVersion=1|2 and three path arrays');
  }
  const data = { ...raw };
  for (const group of ['privatePaths', 'publicPaths', 'protectedPaths']) {
    const paths = raw[group].map(relativePath);
    if (new Set(paths).size !== paths.length) throw new Error('Duplicate ' + group + ' entry');
    if (!paths.length) throw new Error('Empty ' + group + ' is not allowed');
    data[group] = paths;
  }
  if (data.schemaVersion === 1) {
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

  // v2 is deliberately narrow: executable files only come from PUBLIC;
  // PRIVATE supplies immutable runtime JSON/assets, never scripts or HTML.
  const publicPaths = ['index.html', 'lib', 'package.json', 'src'];
  const privatePaths = ['public/assets', 'public/data'];
  if (!sameList([...data.publicPaths].sort(), publicPaths) ||
      !sameList([...data.privatePaths].sort(), privatePaths) ||
      !sameList([...data.protectedPaths].sort(), privatePaths)) {
    throw new Error('Schema v2 requires PUBLIC index.html/lib/package.json/src and PRIVATE public/assets/public/data only');
  }
  if (data.publicPaths.some(a => data.privatePaths.some(b => intersects(a, b)))) {
    throw new Error('Schema v2 source paths must not overlap');
  }
  return data;
}

export async function readSyncManifest(privateDir, manifestPath) {
  const filename = manifestPath || path.join(privateDir, 'production-public-sync.json');
  return validateSyncManifest(JSON.parse(await fs.readFile(filename, 'utf8')));
}
