import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assembleProduction } from '../scripts/assemble-production.mjs';

async function write(root, name, value) {
  const dest = path.join(root, name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, value);
}

async function setup(t) {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'production-overlay-test-'));
  t.after(() => fs.rm(scratch, { recursive: true, force: true }));
  const publicRoot = path.join(scratch, 'public-clone');
  const privateRoot = path.join(scratch, 'private-clone');
  await fs.mkdir(publicRoot);
  await fs.mkdir(privateRoot);
  await write(publicRoot, 'public/assets/shared.js', 'new shared game code');
  await write(publicRoot, 'public/data/field.json', '{"synthetic":true}');
  await write(privateRoot, 'public/assets/shared.js', 'old shared game code');
  await write(privateRoot, 'public/data/field.json', '{"real":true}');
  await write(privateRoot, 'public/games/catalog.json', '{"title":"private production name"}');
  const manifest = {
    schemaVersion: 1,
    privatePaths: ['public'],
    publicPaths: ['public/assets/shared.js'],
    protectedPaths: ['public/data', 'public/games/catalog.json']
  };
  await write(privateRoot, 'production-public-sync.json', JSON.stringify(manifest));
  return { scratch, publicRoot, privateRoot, manifest };
}

test('shares public code while retaining private data and names', async t => {
  const { scratch, publicRoot, privateRoot } = await setup(t);
  const outputRoot = path.join(scratch, 'assembled');
  await assembleProduction({ publicRoot, privateRoot, outputRoot });
  assert.equal(await fs.readFile(path.join(outputRoot, 'public/assets/shared.js'), 'utf8'), 'new shared game code');
  assert.equal(await fs.readFile(path.join(outputRoot, 'public/data/field.json'), 'utf8'), '{"real":true}');
  assert.equal(await fs.readFile(path.join(outputRoot, 'public/games/catalog.json'), 'utf8'), '{"title":"private production name"}');
  await assert.rejects(assembleProduction({ publicRoot, privateRoot, outputRoot }), /already exists/);
});

test('refuses source checkout as an output directory', async t => {
  const { publicRoot, privateRoot } = await setup(t);
  await assert.rejects(assembleProduction({ publicRoot, privateRoot, outputRoot: privateRoot }), /outside both source/);
});

test('refuses an update that would overwrite protected data', async t => {
  const { scratch, publicRoot, privateRoot, manifest } = await setup(t);
  manifest.publicPaths.push('public/data');
  await write(privateRoot, 'production-public-sync.json', JSON.stringify(manifest));
  await assert.rejects(
    assembleProduction({ publicRoot, privateRoot, outputRoot: path.join(scratch, 'assembled') }),
    /overlaps private-protected/
  );
});

test('refuses path traversal and symbolic links', async t => {
  const { scratch, publicRoot, privateRoot, manifest } = await setup(t);
  manifest.publicPaths = ['../outside'];
  await write(privateRoot, 'production-public-sync.json', JSON.stringify(manifest));
  await assert.rejects(
    assembleProduction({ publicRoot, privateRoot, outputRoot: path.join(scratch, 'assembled') }),
    /Unsafe path/
  );
  manifest.publicPaths = ['public/assets/shared.js'];
  await write(privateRoot, 'production-public-sync.json', JSON.stringify(manifest));
  await fs.unlink(path.join(publicRoot, 'public/assets/shared.js'));
  await fs.symlink(path.join(publicRoot, 'public/data/field.json'), path.join(publicRoot, 'public/assets/shared.js'));
  await assert.rejects(
    assembleProduction({ publicRoot, privateRoot, outputRoot: path.join(scratch, 'assembled') }),
    /Symbolic link refused/
  );
});
