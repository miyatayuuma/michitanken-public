import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArguments, prepareIntegrated } from '../scripts/dev-integrated.mjs';

async function put(root, name, content) {
  const dest = path.join(root, name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, content);
}

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'michi-dev-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicRoot = path.join(root, 'public');
  const privateRoot = path.join(root, 'private');
  await fs.mkdir(publicRoot);
  await fs.mkdir(privateRoot);
  await put(publicRoot, 'src/main.js', 'export const version = "new";');
  await put(privateRoot, 'src/main.js', 'export const version = "old";');
  await put(publicRoot, 'lib/field.mjs', 'export const data = "synthetic";');
  await put(privateRoot, 'lib/field.mjs', 'export const data = "private";');
  await put(publicRoot, 'lib/game.mjs', 'export const engine = "new";');
  await put(privateRoot, 'lib/game.mjs', 'export const engine = "old";');
  await put(privateRoot, 'public/data/tiles.json', '{"private":true}');
  await put(privateRoot, 'package.json', '{"private":true}');
  const manifest = {
    schemaVersion: 1,
    privatePaths: ['src', 'lib', 'public/data', 'package.json'],
    publicPaths: ['src', 'lib'],
    protectedPaths: ['lib/field.mjs', 'public/data', 'package.json']
  };
  await put(privateRoot, 'production-public-sync.json', JSON.stringify(manifest));
  return { root, publicRoot, privateRoot };
}

test('one-call development staging retains private files and uses current public engine', async t => {
  const { root, publicRoot, privateRoot } = await setup(t);
  const siteRoot = path.join(root, 'site');
  const result = await prepareIntegrated({ publicRoot, privateRoot, outputRoot: siteRoot });
  assert.equal(result.verification.status, 'PASS');
  assert.equal(await fs.readFile(path.join(siteRoot, 'src/main.js'), 'utf8'), 'export const version = "new";');
  assert.equal(await fs.readFile(path.join(siteRoot, 'lib/game.mjs'), 'utf8'), 'export const engine = "new";');
  assert.equal(await fs.readFile(path.join(siteRoot, 'lib/field.mjs'), 'utf8'), 'export const data = "private";');
  assert.equal(await fs.readFile(path.join(siteRoot, 'public/data/tiles.json'), 'utf8'), '{"private":true}');
  await assert.rejects(prepareIntegrated({ publicRoot, privateRoot, outputRoot: siteRoot }), /already exists/);
});

test('rejects invalid commands and incomplete SHA pins', () => {
  assert.throws(() => parseArguments([]), /--private is required/);
  assert.throws(() => parseArguments(['--private', 'x', '--unknown']), /Invalid option/);
  assert.throws(() => parseArguments(['--private', 'x', '--private', 'y']), /Duplicate option/);
  assert.throws(() => parseArguments(['--private', 'x', '--public-sha', 'abc']), /40-character/);
  assert.equal(parseArguments(['--private', 'x', '--build']).build, true);
});

test('pinned build refuses non-Git or mismatched checkouts before copying', async t => {
  const { root, publicRoot, privateRoot } = await setup(t);
  await assert.rejects(
    prepareIntegrated({
      publicRoot, privateRoot, outputRoot: path.join(root, 'never-created'),
      expectedPublicSha: 'a'.repeat(40)
    }),
    /PUBLIC checkout is not a Git repository/
  );
  await assert.rejects(fs.access(path.join(root, 'never-created')));
});
