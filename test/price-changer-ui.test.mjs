import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
let browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser?.close(); });

async function fixture(t, options = {}) {
  const requests = [], pageErrors = [];
  const reply = (res, body, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      requests.push({ method: req.method, pathname: url.pathname, search: url.search });
      if (req.method === 'POST') {
        if (url.pathname === '/api/price-changer/open') {
          let body = '';
          for await (const chunk of req) body += chunk;
          assert.deepEqual(JSON.parse(body), {});
          if (options.waitForOpen) await options.waitForOpen;
          return reply(res, options.openResponse || { url: origin + '/?priceFixture=1' }, options.openStatus || 200);
        }
        return reply(res, { error: 'Unexpected mutation in UI fixture' }, 405);
      }
      if (url.pathname === '/api/state') return reply(res, {
        product: null, revision: 1, busy: false, phase: 'idle', logs: [],
        benefitResearch: { status: 'on-demand' },
      });
      if (url.pathname === '/api/branding') return reply(res, { visible: false });
      if (url.pathname === '/api/naver-status') return reply(res, { configured: false });
      if (url.pathname === '/api/smartstore-two-choice') return reply(res, { packages: [] });
      if (url.pathname === '/' && url.searchParams.has('priceFixture')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><title>가격변경기 테스트</title><h1>가격변경기 테스트 화면</h1>');
      }
      const filename = path.resolve(publicRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!filename.startsWith(publicRoot + path.sep)) { res.writeHead(404); return res.end(); }
      const content = await readFile(filename).catch(() => null);
      if (!content) { res.writeHead(404); return res.end(); }
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
      res.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
      res.end(content);
    } catch (error) {
      reply(res, { error: error.message }, 500);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort();
  });
  t.after(async () => {
    await context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin);
  await page.waitForFunction(() => typeof document.querySelector('#openPriceChanger')?.onclick === 'function');
  await page.waitForFunction(() => document.querySelector('#status').textContent === '대기');
  return { page, context, requests, pageErrors, origin, button: page.locator('#openPriceChanger') };
}

const postPaths = requests => requests.filter(request => request.method === 'POST').map(request => request.pathname);

test('가격변경기 아이콘이 데스크톱·좁은 화면에서 새로고침 왼쪽에 보인다', async t => {
  const f = await fixture(t);
  const screenshots = await mkdtemp(path.join(os.tmpdir(), 'price-changer-ui-'));
  for (const [name, width, height] of [['desktop', 1280, 800], ['narrow', 390, 844]]) {
    await f.page.setViewportSize({ width, height });
    const launch = await f.button.boundingBox();
    const refresh = await f.page.locator('#refreshPage').boundingBox();
    assert.ok(launch && refresh);
    assert.ok(Math.abs(launch.y - refresh.y) < 2, name + ': buttons share a row');
    assert.ok(launch.x + launch.width <= refresh.x, name + ': shortcut is left of refresh');
    assert.ok(launch.x >= 0 && refresh.x + refresh.width <= width, name + ': controls fit viewport');
    assert.ok(launch.height >= 42, name + ': touch target height');
    assert.equal(await f.button.locator('svg[aria-hidden="true"]').count(), 1);
    assert.equal(await f.button.getAttribute('aria-label'), '가격변경기 새 탭으로 열기');
    const filename = path.join(screenshots, name + '.png');
    await f.page.screenshot({ path: filename });
    t.diagnostic('Screenshot: ' + filename);
  }
  assert.deepEqual(postPaths(f.requests), []);
  assert.deepEqual(f.pageErrors, []);
});

test('연결 중 중복 클릭을 막고 새 가격 탭만 열며 등록기와 실행 상태를 유지한다', async t => {
  let release;
  const waitForOpen = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { waitForOpen });
  t.after(() => release());
  await f.page.locator('#style').fill('326932');
  const popupPromise = f.page.waitForEvent('popup');
  await f.button.click();
  const popup = await popupPromise;
  await f.page.waitForFunction(() => document.querySelector('#openPriceChanger').disabled);
  assert.equal(await f.button.getAttribute('aria-busy'), 'true');
  assert.equal(await popup.locator('body').textContent(), '가격변경기를 연결하고 있습니다…');
  await f.button.dispatchEvent('click');
  assert.equal(f.context.pages().length, 2);
  release();
  await popup.waitForURL(f.origin + '/?priceFixture=1');
  await popup.getByRole('heading', { name: '가격변경기 테스트 화면' }).waitFor();
  await f.page.waitForFunction(() => !document.querySelector('#openPriceChanger').disabled);
  assert.equal(await f.button.getAttribute('aria-busy'), null);
  assert.equal(await popup.evaluate(() => window.opener), null);
  assert.equal(f.page.url(), f.origin + '/');
  assert.equal(await f.page.locator('#style').inputValue(), '326932');
  assert.deepEqual(postPaths(f.requests), ['/api/price-changer/open']);
  assert.deepEqual(f.pageErrors, []);
});

test('연결 실패 시 공백 탭을 닫고 오류를 알리며 버튼을 복구한다', async t => {
  const f = await fixture(t, { openResponse: { error: '테스트: 가격변경기 시작 실패' }, openStatus: 503 });
  const popupPromise = f.page.waitForEvent('popup');
  await f.button.click();
  const popup = await popupPromise;
  await f.page.getByText('테스트: 가격변경기 시작 실패', { exact: true }).waitFor();
  await f.page.waitForFunction(() => !document.querySelector('#openPriceChanger').disabled);
  assert.equal(popup.isClosed(), true);
  assert.equal(f.context.pages().length, 1);
  assert.equal(await f.button.getAttribute('aria-busy'), null);
  assert.equal(f.page.url(), f.origin + '/');
  assert.deepEqual(postPaths(f.requests), ['/api/price-changer/open']);
  assert.deepEqual(f.pageErrors, []);
});

test('가격변경기 아닌 연결 주소를 열지 않고 공백 탭을 정리한다', async t => {
  const f = await fixture(t, { openResponse: { url: 'https://example.com/unexpected' } });
  const popupPromise = f.page.waitForEvent('popup');
  await f.button.click();
  const popup = await popupPromise;
  await f.page.getByText('가격변경기 연결 주소를 확인해 주세요.', { exact: true }).waitFor();
  assert.equal(popup.isClosed(), true);
  assert.equal(await f.button.isEnabled(), true);
  assert.equal(f.context.pages().length, 1);
  assert.deepEqual(postPaths(f.requests), ['/api/price-changer/open']);
  assert.deepEqual(f.pageErrors, []);
});
