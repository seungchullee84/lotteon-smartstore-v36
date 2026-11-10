import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { LotteAutomation } from '../automation.mjs';

const fields = [
  ['제품 소재', '면 100%'],
  ['색상', '화이트,블랙'],
  ['치수', 'S,M,L'],
  ['제조국', '베트남'],
  ['세탁방법 및 취급시 주의사항', '단독 세탁'],
];
const product = {
  material: fields[0][1],
  colors: ['화이트', '블랙'],
  sizes: ['S', 'M', 'L'],
  country: fields[3][1],
  washing: fields[4][1],
  manufactured: '2026-10',
};

async function noticeFixture(browser, { delayed = false, rejectsCommit = false } = {}) {
  const page = await browser.newPage();
  const rows = fields.map(([label], index) => {
    const id = 'grd_PintfcnItem_body_gridrow_' + index + '_cell_' + index + '_';
    return '<div class="row"><button id="' + id + '0">' + label + '</button><div class="value" id="' + id + '2">이전값</div></div>';
  }).join('');
  await page.setContent('<style>.row{display:flex;margin:10px}.row button{width:260px}.value{width:270px;height:30px;background:#eee}</style>'
    + '<input id="grd_PintfcnItem_controledit_input" value="오래된 편집기" hidden>'
    + rows);
  await page.evaluate(({ delayed, rejectsCommit }) => {
    window.noticeEvents = { edits: [], commits: [] };
    for (const [index, row] of Array.from(document.querySelectorAll('.row')).entries()) {
      const label = row.querySelector('button');
      const cell = row.querySelector('.value');
      cell.dataset.committed = cell.innerText;
      cell.addEventListener('dblclick', () => {
        window.noticeEvents.edits.push(index);
        const open = () => {
          const editor = document.createElement(index === 4 ? 'textarea' : 'input');
          editor.id = index === 4
            ? 'grd_PintfcnItem_controltextarea_textarea'
            : 'grd_PintfcnItem_controledit_input';
          editor.value = cell.dataset.committed;
          cell.replaceChildren(editor);
          editor.focus();
        };
        if (delayed && index === 4) setTimeout(open, 45);
        else open();
      });
      label.addEventListener('click', () => {
        const editor = cell.querySelector('input,textarea');
        if (!editor) return;
        const value = editor.value;
        const commit = () => {
          if (rejectsCommit && index === 4) return;
          cell.dataset.committed = value;
          cell.textContent = value;
          window.noticeEvents.commits.push(index);
        };
        if (delayed && index === 4) setTimeout(commit, 240);
        else commit();
      });
    }
  }, { delayed, rejectsCommit });
  const automation = new LotteAutomation('', () => {});
  automation.page = page;
  const months = [];
  // Manufacture date has a separate picker. Keep this fixture focused on text commits.
  automation.completeNoticeSettings = async date => months.push(date);
  return { page, automation, months };
}

test('롯데 상품정보고시 고정 대기 대신 입력값이 반영되면 다음 항목을 진행', async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());

  await t.test('정상 텍스트 항목 5개를 한 번씩만 반영한다', async t => {
    const { page, automation, months } = await noticeFixture(browser);
    t.after(() => page.close());
    await automation.fillNotices(product);
    assert.deepEqual(await page.locator('.value').allTextContents(), fields.map(([, value]) => value));
    assert.deepEqual(await page.evaluate(() => window.noticeEvents), {
      edits: [0, 1, 2, 3, 4], commits: [0, 1, 2, 3, 4],
    });
    assert.deepEqual(months, [product.manufactured]);
  });

  await t.test('포커스가 늦고 포커스를 잃은 편집기가 잠시 남아도 실제 반영을 기다린다', async t => {
    const { page, automation, months } = await noticeFixture(browser, { delayed: true });
    t.after(() => page.close());
    await automation.fillNotices(product);
    assert.deepEqual(await page.locator('.value').allTextContents(), fields.map(([, value]) => value));
    assert.deepEqual(await page.evaluate(() => window.noticeEvents), {
      edits: [0, 1, 2, 3, 4], commits: [0, 1, 2, 3, 4],
    });
    assert.deepEqual(months, [product.manufactured]);
  });

  await t.test('입력은 받았지만 실제 반영이 안 된 항목은 완료 처리하지 않는다', { timeout: 10_000 }, async t => {
    const { page, automation, months } = await noticeFixture(browser, { rejectsCommit: true });
    t.after(() => page.close());
    await assert.rejects(automation.fillNotices(product), /고시 입력값 반영 확인 실패: 세탁방법 및 취급시 주의사항/);
    const washingCell = page.locator('.value').last();
    assert.equal(await washingCell.getAttribute('data-committed'), '이전값');
    assert.equal(await washingCell.locator('textarea').inputValue(), product.washing);
    assert.equal(await washingCell.locator('textarea:focus').count(), 0);
    const { edits, commits } = await page.evaluate(() => window.noticeEvents);
    assert.deepEqual(commits, [0, 1, 2, 3]);
    assert.ok(edits.filter(index => index === 4).length <= 3);
    assert.deepEqual(months, []);
  });
});
