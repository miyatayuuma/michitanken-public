import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assembleProduction } from '../scripts/assemble-production.mjs';
import { verifyProductionOverlay } from '../scripts/verify-production-overlay.mjs';
import { validateSyncManifest } from '../scripts/sync-manifest.mjs';
import { validateSiteConfig } from '../lib/site-config.mjs';

const fakeConfig = {
  schema: 1,
  title: '合成地形テスト',
  credits: [
    { text: '架空データ · ' },
    { text: '参照先', href: 'https://example.org/license' }
  ]
};

async function put(root, name, data) {
  const dest = path.join(root, name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, data);
}

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'data-only-overlay-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pub = path.join(root, 'pub');
  const priv = path.join(root, 'priv');
  await fs.mkdir(pub);
  await fs.mkdir(priv);
  for (const name of ['index.html', 'src/main.js', 'lib/field.mjs', 'package.json']) {
    await put(pub, name, 'PUBLIC:' + name);
    await put(priv, name, 'PRIVATE-LEGACY:' + name);
  }
  await put(pub, 'public/data/synthetic.json', '{"sample":true}');
  await put(priv, 'src/legacy-only.js', 'private script that must not ship');
  await put(priv, 'public/data/site-config.json', JSON.stringify(fakeConfig));
  await put(priv, 'public/data/tiles.json', '{"real":true}');
  await put(priv, 'public/assets/nature/model.glb', 'fake binary model');
  const manifest = {
    schemaVersion: 2,
    publicPaths: ['index.html', 'src', 'lib', 'package.json'],
    privatePaths: ['public/data', 'public/assets'],
    protectedPaths: ['public/data', 'public/assets']
  };
  await put(priv, 'production-public-sync.json', JSON.stringify(manifest));
  return { root, pub, priv, manifest };
}

test('v2 stages PUBLIC-only code and PRIVATE-only data/assets', async t => {
  const { root, pub, priv } = await setup(t);
  const site = path.join(root, 'site');
  const result = await assembleProduction({ publicRoot: pub, privateRoot: priv, outputRoot: site });
  assert.equal(result.schemaVersion, 2);
  assert.equal(await fs.readFile(path.join(site, 'index.html'), 'utf8'), 'PUBLIC:index.html');
  assert.equal(await fs.readFile(path.join(site, 'lib/field.mjs'), 'utf8'), 'PUBLIC:lib/field.mjs');
  assert.equal(await fs.readFile(path.join(site, 'public/data/tiles.json'), 'utf8'), '{"real":true}');
  await assert.rejects(fs.access(path.join(site, 'src/legacy-only.js')));
  await assert.rejects(fs.access(path.join(site, 'public/data/synthetic.json')));
  assert.equal((await verifyProductionOverlay({ publicRoot: pub, privateRoot: priv, siteRoot: site })).schemaVersion, 2);
  await fs.writeFile(path.join(site, 'public/data/tiles.json'), '{"tampered":true}');
  await assert.rejects(
    verifyProductionOverlay({ publicRoot: pub, privateRoot: priv, siteRoot: site }),
    /Production integrity mismatch/
  );
});

test('v2 refuses private executable content, invalid config and mixed ownership', async t => {
  const { root, pub, priv, manifest } = await setup(t);
  const site = path.join(root, 'site');
  await put(priv, 'public/data/unsafe.js', 'alert(1)');
  await assert.rejects(
    assembleProduction({ publicRoot: pub, privateRoot: priv, outputRoot: site }),
    /Executable or unsupported PRIVATE runtime file/
  );
  await fs.unlink(path.join(priv, 'public/data/unsafe.js'));
  await put(priv, 'public/data/site-config.json', '{"schema":1,"title":"x","credits":[{"text":"x","href":"javascript:alert(1)"}]}');
  await assert.rejects(
    assembleProduction({ publicRoot: pub, privateRoot: priv, outputRoot: site }),
    /Credit URLs must be HTTPS/
  );
  manifest.privatePaths.push('src');
  assert.throws(() => validateSyncManifest(manifest), /Schema v2 requires/);
});

test('presentation data validates safely without HTML injection', () => {
  assert.equal(validateSiteConfig(fakeConfig).title, '合成地形テスト');
  assert.throws(() => validateSiteConfig({ ...fakeConfig, secret: 'do not ship' }), /Invalid site-config schema/);
  assert.throws(() => validateSiteConfig({ ...fakeConfig, credits: [{ text: '<script>', href: 'http://example.org' }] }), /HTTPS/);
  assert.throws(() => validateSiteConfig({ ...fakeConfig, credits: [] }), /Invalid site-config schema/);
});
