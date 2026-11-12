import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { createPriceChangerLauncher } from '../price-changer-launcher.mjs';

const key = 'a'.repeat(48), oldKey = 'b'.repeat(48);
const state = { plan: null, results: {}, busy: false, message: 'ready' };
const offline = async () => { throw new Error('ECONNREFUSED'); };
function child() { const result = new EventEmitter(); result.unref = () => {}; return result; }
async function fixture(t, port = 49428, sessionKey = key) {
  const appDir = await mkdtemp(path.join(os.tmpdir(), 'price-launcher-'));
  t.after(() => rm(appDir, { recursive: true, force: true }));
  const data = path.join(appDir, 'data');
  await mkdir(data);
  await writeFile(path.join(appDir, 'server.mjs'), '// test fixture');
  await writeFile(path.join(data, 'local-auth.key'), key);
  await writeFile(path.join(data, 'desktop-session.txt'), `http://127.0.0.1:${port}/?key=${sessionKey}`);
  return { appDir, data };
}

test('uses the authenticated running app through read-only HTTP without launching', async t => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, cookie: req.headers.cookie });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(state));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const { appDir, data } = await fixture(t, port);
  const registrarRoot = path.join(appDir, 'registrar fixture');
  const launcher = createPriceChangerLauncher({ appDir, port, registrarRoot, spawnImpl() { assert.fail('already running'); } });
  const result = await launcher.open();
  assert.equal(result.reused, true);
  assert.equal(result.url, `http://127.0.0.1:${port}/?key=${key}`);
  assert.deepEqual(requests, [{ method: 'GET', url: '/api/state', cookie: `price_changer_${port}=${key}` }]);
  assert.equal(await readFile(path.join(data, 'registrar-login-root.txt'), 'utf8'), registrarRoot);
});

test('recovers a stale launch token from the current persistent auth key', async t => {
  const { appDir } = await fixture(t, 49428, oldKey);
  const cookies = [];
  const launcher = createPriceChangerLauncher({ appDir,
    fetchImpl: async (url, options) => {
      cookies.push(options.headers.Cookie);
      return options.headers.Cookie.endsWith(key) ? Response.json(state) : Response.json({}, { status: 403 });
    }, spawnImpl() { assert.fail('must reuse'); },
  });
  assert.equal((await launcher.open()).url, `http://127.0.0.1:49428/?key=${key}`);
  assert.deepEqual(cookies, [`price_changer_49428=${oldKey}`, `price_changer_49428=${key}`]);
});

test('never follows a remote or unexpected session address or redirect', async t => {
  const { appDir, data } = await fixture(t);
  for (const saved of [`https://example.com/?key=${key}`, `http://127.0.0.1:1234/?key=${oldKey}`,
    `http://user@127.0.0.1:49428/?key=${oldKey}`, `http://127.0.0.1:49428/other?key=${oldKey}`]) {
    await writeFile(path.join(data, 'desktop-session.txt'), saved);
    const launcher = createPriceChangerLauncher({ appDir,
      fetchImpl: async (url, options) => {
        assert.equal(url, 'http://127.0.0.1:49428/api/state');
        assert.equal(options.redirect, 'manual');
        assert.equal(options.headers.Cookie, `price_changer_49428=${key}`);
        return Response.json(state);
      }, spawnImpl() { assert.fail('must reuse safe local key'); },
    });
    assert.equal((await launcher.open()).url, `http://127.0.0.1:49428/?key=${key}`);
  }
});

test('simultaneous clicks start one hidden server and wait for authenticated readiness', async t => {
  const { appDir, data } = await fixture(t);
  let online = false, starts = 0;
  const launcher = createPriceChangerLauncher({ appDir,
    fetchImpl: async () => online ? Response.json(state) : offline(),
    spawnImpl: (runtime, args, options) => {
      starts++;
      assert.equal(runtime, process.execPath);
      assert.deepEqual(args, ['server.mjs']);
      assert.equal(options.cwd, appDir);
      assert.equal(options.windowsHide, true);
      assert.equal(options.detached, true);
      assert.equal(options.stdio, 'ignore');
      assert.equal(options.env.PRICE_CHANGER_NO_OPEN, '1');
      assert.equal(options.env.PRICE_CHANGER_DATA, data);
      assert.equal(options.env.PRICE_CHANGER_READY_FILE, path.join(data, 'desktop-session.txt'));
      online = true;
      return child();
    },
  });
  const opened = await Promise.all([launcher.open(), launcher.open(), launcher.open()]);
  assert.equal(starts, 1);
  assert.ok(opened.every(result => result.reused === false));
  assert.equal((await launcher.open()).reused, true);
  assert.equal(starts, 1);
});

test('an occupied port or wrong credentials never starts a duplicate process', async t => {
  const { appDir } = await fixture(t);
  for (const response of [() => Response.json({}, { status: 403 }), () => Response.json({ unrelated: true }),
    () => new Response('', { status: 302, headers: { Location: 'https://example.com' } })]) {
    const launcher = createPriceChangerLauncher({ appDir, fetchImpl: async () => response(),
      spawnImpl() { assert.fail('occupied port must not launch'); },
    });
    await assert.rejects(launcher.open(), /접속 정보를 확인하지 못했습니다/);
  }
});

test('a failed spawn returns a sanitized error and the next click can retry', async t => {
  const { appDir } = await fixture(t);
  let online = false, starts = 0;
  const launcher = createPriceChangerLauncher({ appDir, fetchImpl: async () => online ? Response.json(state) : offline(),
    spawnImpl() {
      starts++;
      if (starts === 1) throw new Error(`failed secret ${key}`);
      online = true;
      return child();
    },
  });
  await assert.rejects(launcher.open(), error => !error.message.includes(key) && /실행하지 못했습니다/.test(error.message));
  assert.equal((await launcher.open()).reused, false);
  assert.equal(starts, 2);
});

test('a start timeout is bounded and does not leak the launch key', async t => {
  const { appDir } = await fixture(t);
  const launcher = createPriceChangerLauncher({ appDir, fetchImpl: offline, spawnImpl: child,
    startupTimeoutMs: 15, pollMs: 5,
  });
  await assert.rejects(launcher.open(), error => !error.message.includes(key) && /시작이 지연/.test(error.message));
});

test('missing installation is reported without creating files or spawning', async t => {
  const { appDir } = await fixture(t);
  await rm(path.join(appDir, 'server.mjs'));
  const launcher = createPriceChangerLauncher({ appDir, fetchImpl: offline,
    spawnImpl() { assert.fail('missing installation'); },
  });
  await assert.rejects(launcher.open(), /설치되어 있지 않습니다/);
});
