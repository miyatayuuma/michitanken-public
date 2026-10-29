import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scripts = {
  release: fileURLToPath(new URL('../scripts/release-mt11a.sh', import.meta.url)),
  resume: fileURLToPath(new URL('../scripts/resume-mt11a-release.sh', import.meta.url))
};

test('release scripts are syntactically valid and never select moving main', () => {
  for (const file of Object.values(scripts)) {
    const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const release = readFileSync(scripts.release, 'utf8');
  const resume = readFileSync(scripts.resume, 'utf8');
  assert.doesNotMatch(release, /tarball\/main/);
  assert.match(release, /EXPECTED_PRIVATE_HEAD/);
  assert.match(release, /EXPECTED_DREAM_HEAD/);
  assert.match(release, /source-refs\.txt/);
  assert.match(release, /--deploy/);
  assert.doesNotMatch(resume, /^work=\/tmp\//m);
  assert.match(resume, /source-refs\.txt/);
  assert.match(resume, /--deploy/);
});

test('release and resume reject incomplete input before performing external work', () => {
  const release = spawnSync('bash', [scripts.release], { encoding: 'utf8' });
  assert.notEqual(release.status, 0);
  assert.match(release.stderr, /Expected PUBLIC PR HEAD/);
  const resume = spawnSync('bash', [scripts.resume], { encoding: 'utf8' });
  assert.notEqual(resume.status, 0);
  assert.match(resume.stderr, /Previous release workspace path/);
  const invalid = spawnSync('bash', [scripts.release, 'a'.repeat(40), 'not-a-sha', 'b'.repeat(40)], { encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stdout, /full lowercase commit SHAs/);
});
