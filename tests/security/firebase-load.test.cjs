const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('Firebase loads when the runtime disables require(ESM)', () => {
  // Reproduce the serverless runtime restriction without credentials or network.
  const result = spawnSync(process.execPath, [
    '--no-experimental-require-module', '-e',
    "require('./server/firebase'); require('./api/access-requests'); require('./api/admin-users');",
  ], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
