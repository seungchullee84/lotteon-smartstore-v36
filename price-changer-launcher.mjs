import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const KEY = /^[a-f0-9]{48}$/;

function sessionUrl(text, port) {
  try {
    const url = new URL(text.trim());
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || Number(url.port) !== port ||
        url.pathname !== '/' || url.username || url.password || url.hash ||
        [...url.searchParams.keys()].length !== 1 || !KEY.test(url.searchParams.get('key') || '')) return null;
    return url.href;
  } catch { return null; }
}

// Only returns a local launch URL. Opening the screen never runs a price operation.
export function createPriceChangerLauncher({
  appDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'lotte-price-changer'),
  port = 49428,
  fetchImpl = fetch,
  spawnImpl = spawn,
  startupTimeoutMs = 15000,
  requestTimeoutMs = 1200,
  pollMs = 250,
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('가격변경기 포트 설정을 확인해 주세요.');
  const origin = `http://127.0.0.1:${port}`;
  const dataDir = path.join(appDir, 'data');
  const readyFile = path.join(dataDir, 'desktop-session.txt');
  let pending;

  async function readText(file) {
    try { return (await readFile(file, 'utf8')).trim(); }
    catch (error) { if (error.code === 'ENOENT') return ''; throw new Error('가격변경기 실행 정보를 읽지 못했습니다.'); }
  }

  async function credentials() {
    const [saved, key] = await Promise.all([readText(readyFile), readText(path.join(dataDir, 'local-auth.key'))]);
    return [...new Set([sessionUrl(saved, port), KEY.test(key) ? `${origin}/?key=${key}` : null].filter(Boolean))];
  }

  async function probe() {
    const urls = await credentials();
    let reachable = false;
    for (const url of urls.length ? urls : [null]) {
      try {
        const response = await fetchImpl(`${origin}/api/state`, {
          method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(requestTimeoutMs),
          headers: url ? { Cookie: `price_changer_${port}=${new URL(url).searchParams.get('key')}` } : {},
        });
        reachable = true;
        if (!url || !response.ok) { await response.body?.cancel(); continue; }
        const state = await response.json();
        if (state && Object.hasOwn(state, 'plan') && state.results && typeof state.results === 'object' &&
            typeof state.busy === 'boolean' && typeof state.message === 'string') return { url, reachable };
      } catch { /* A stopped or starting server is retried without exposing its key. */ }
    }
    return { url: null, reachable };
  }

  async function launch() {
    const current = await probe();
    if (current.url) return { url: current.url, reused: true };
    if (current.reachable) throw new Error('가격변경기 접속 정보를 확인하지 못했습니다. 기존 실행 창을 확인해 주세요.');
    try { await access(path.join(appDir, 'server.mjs')); }
    catch { throw new Error('이 컴퓨터에 가격변경기가 설치되어 있지 않습니다. 가격변경기 설치 폴더를 확인해 주세요.'); }

    let failed = false;
    try {
      const child = spawnImpl(process.execPath, ['server.mjs'], {
        cwd: appDir, windowsHide: true, detached: true, stdio: 'ignore',
        env: { ...process.env, PRICE_CHANGER_NO_OPEN: '1', PRICE_CHANGER_PORT: String(port),
          PRICE_CHANGER_DATA: dataDir, PRICE_CHANGER_READY_FILE: readyFile },
      });
      child.once('error', () => { failed = true; });
      child.unref();
    } catch { failed = true; }

    const deadline = Date.now() + startupTimeoutMs;
    do {
      if (failed) throw new Error('가격변경기를 실행하지 못했습니다. 설치 폴더와 Node.js 실행 파일을 확인해 주세요.');
      const ready = await probe();
      if (ready.url) return { url: ready.url, reused: false };
      if (Date.now() >= deadline) break;
      await delay(Math.min(pollMs, Math.max(0, deadline - Date.now())));
    } while (Date.now() <= deadline);
    throw new Error('가격변경기 시작이 지연되고 있습니다. 잠시 후 버튼을 다시 눌러 주세요.');
  }

  return {
    open() {
      if (!pending) pending = launch().finally(() => { pending = null; });
      return pending;
    },
  };
}
