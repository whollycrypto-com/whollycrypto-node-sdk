import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('manual installation outside a Node project needs no npm or node_modules', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wholly-node-manual-'));
  try {
    const sdk = join(directory, 'whollycrypto-node-sdk');
    mkdirSync(sdk);
    cpSync(new URL('../dist', import.meta.url), join(sdk, 'dist'), {recursive: true});
    cpSync(new URL('../package.json', import.meta.url), join(sdk, 'package.json'));
    cpSync(new URL('./manual-probe.mjs', import.meta.url), join(directory, 'app.mjs'));
    writeFileSync(join(directory, 'app.cjs'), `
      const assert = require('node:assert/strict');
      const {Client, VERSION} = require('./whollycrypto-node-sdk/dist/index.js');
      assert.equal(VERSION, '2.0.0');
      const client = new Client('https://api.example.test', 'wc_fixture_not_a_real_credential');
      assert.equal(client.lastResponse, null);
      client.close();
    `);
    assert.equal(existsSync(join(directory, 'node_modules')), false);
    assert.equal(existsSync(join(sdk, 'node_modules')), false);
    for (const script of ['app.cjs', 'app.mjs']) {
      const result = spawnSync(process.execPath, [join(directory, script)], {
        cwd: tmpdir(), encoding: 'utf8', timeout: 15_000,
        env: {...process.env, NODE_PATH: '', NODE_OPTIONS: ''},
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
