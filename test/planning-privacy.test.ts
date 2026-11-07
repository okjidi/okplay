import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('public repository ignores private planning trees and none are already tracked', () => {
  const paths = ['.planning/remaining-main/findings.md', 'planning/private-findings.md'];
  const ignored = spawnSync('git', ['check-ignore', '--stdin'], { cwd: new URL('..', import.meta.url), input: paths.join('\n')+'\n', encoding:'utf8' });
  assert.equal(ignored.status,0);
  assert.deepEqual(ignored.stdout.trim().split(/\r?\n/),paths);
  const tracked = spawnSync('git', ['ls-files', '--', '.planning', 'planning'], { cwd: new URL('..', import.meta.url), encoding:'utf8' });
  assert.equal(tracked.status,0);
  assert.equal(tracked.stdout.trim(),'');
});
