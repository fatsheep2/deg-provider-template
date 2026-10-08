import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhen, ruleCard, fieldLabel } from '../src/rules-view.mjs';
import { parseDelimited, splitTable } from '../src/csv.mjs';
import { highlightBeancount } from '../src/beancount.mjs';
import { highlightYaml } from '../src/yaml-highlight.mjs';
import { translate } from '../src/i18n.mjs';

const kinds = (line) => line.map((t) => t.k);
const text = (line) => line.map((t) => t.v).join('');

test('parseWhen keeps plain conditions addressable', () => {
  const one = parseWhen('<交易状态> == 交易关闭');
  assert.equal(one.complex, false);
  assert.equal(one.conds.length, 1);
  assert.equal(one.conds[0].field, '<交易状态>');
  assert.equal(one.conds[0].op, '==');
  assert.equal(one.conds[0].value, '交易关闭');

  const two = parseWhen('<交易分类> ~ 餐饮美食 && <交易时间>.time >= 16:00');
  assert.equal(two.complex, false);
  assert.equal(two.conds.length, 2);
  assert.equal(two.join, 'and');
  assert.equal(two.conds[1].suffix, 'time');
  assert.equal(two.conds[1].op, '>=');

  const or = parseWhen('payee ~ "美团" || narration ~ "外卖"');
  assert.equal(or.join, 'or');
  assert.equal(or.conds[0].field, 'payee');
  assert.equal(or.conds[0].value, '美团');
});

test('parseWhen refuses to guess grouped or method-chain expressions', () => {
  assert.equal(parseWhen('(<交易对> == "BTC/USDT" || <交易对> == "BTC1S/USDT") && <方向> == "买入"').complex, true);
  assert.equal(parseWhen('raw[列] == "x"').complex, true);
  assert.equal(parseWhen('<手续费>.extract("([A-Za-z]+)$") == <交易对>.extract("^([^/]+)")').complex, true);
  assert.equal(parseWhen('').empty, true);
});

test('field labels fall back to the literal column name', () => {
  const t = (k) => translate('zh-CN', k);
  assert.equal(fieldLabel('<交易对方>', t), '交易对方');
  assert.equal(fieldLabel('payee', t), '商户');
  assert.equal(fieldLabel('raw[商品]', t), '商品');
  assert.equal(fieldLabel('type', t), '收/支');
});

test('ruleCard renders ignore-style and multi-condition rules as prose', () => {
  const t = (k) => translate('zh-CN', k);
  const ignore = ruleCard({ id: '忽略关闭交易', when: '<交易状态> == 交易关闭', actions: { ignore: true } }, t);
  assert.equal(ignore.id, '忽略关闭交易');
  assert.equal(ignore.whenKind, 'simple');
  assert.deepEqual(ignore.conditions, ['交易状态 为 交易关闭']);
  assert.equal(ignore.joinText, '且');
  assert.equal(ignore.actionKind, 'ignore');
  assert.deepEqual(ignore.actions, ['忽略这笔']);
  assert.equal(ignore.shortAction, '忽略这笔');

  const complex = ruleCard({ id: 'BTC', when: '(<a> == "x" || <b> == "y") && <c> == "z"', actions: { to: 'Assets:X' } }, t);
  assert.equal(complex.whenKind, 'complex');
  assert.equal(complex.complex, true);
  assert.equal(complex.actionKind, 'account');
  assert.deepEqual(complex.actions, ['记入 Assets:X']);

  const template = ruleCard({ id: 'base', actions: { payee: 'X', vars: { a: '1' } } }, t);
  assert.equal(template.whenKind, 'always');
  assert.equal(template.actionKind, 'set');
  assert.equal(template.conditions.length, 0);
});

test('parseDelimited handles quotes, CRLF, tabs and trailing newline', () => {
  const csv = parseDelimited('A,B\n"x,1","he said ""hi"""\n2,\n');
  assert.equal(csv.totalRows, 3);
  assert.deepEqual(csv.rows[0], ['A', 'B']);
  assert.deepEqual(csv.rows[1], ['x,1', 'he said "hi"']);
  assert.deepEqual(csv.rows[2], ['2', '']);

  const table = splitTable(csv.rows);
  assert.deepEqual(table.header, ['A', 'B']);
  assert.deepEqual(table.body[0], ['x,1', 'he said "hi"']);

  const tsv = parseDelimited('A\tB\n1\t2\n');
  assert.equal(tsv.delimiter, '\t');
  assert.deepEqual(tsv.rows[1], ['1', '2']);
  assert.equal(parseDelimited('').rows.length, 0);
});

test('splitTable finds the real header under a bank preamble', () => {
  const parsed = parseDelimited(
    '中国建设银行,,,,,\n账号：,xxx,,,,\n交易日期,摘要,金额,币种,余额\n2026-05-01,消费,-10.00,CNY,100.00\n',
  );
  const table = splitTable(parsed.rows);
  assert.equal(table.preamble.length, 2);
  assert.deepEqual(table.header, ['交易日期', '摘要', '金额', '币种', '余额']);
  assert.equal(table.body.length, 1);
  assert.equal(table.body[0][1], '消费');
});

test('beancount highlighting separates dates, flags, strings, accounts, meta and amounts', () => {
  const lines = highlightBeancount(
    '2025-11-15 * "TRX 转出" #crypto\n  blockTime: "2025-11-15T18:48:12"\n  Assets:Crypto:Software:Tron:TFGqVk -4.746000 TRX\n',
  );
  assert.deepEqual(kinds(lines[0]).slice(0, 3), ['date', 'space', 'flag']);
  assert.ok(kinds(lines[0]).includes('string'));
  assert.ok(kinds(lines[0]).includes('tag'));
  assert.ok(kinds(lines[1]).includes('meta'));
  assert.ok(kinds(lines[2]).includes('account'));
  assert.ok(kinds(lines[2]).includes('number'));
  assert.ok(kinds(lines[2]).includes('currency'));
  assert.equal(text(lines[0]), '2025-11-15 * "TRX 转出" #crypto');
  assert.equal(text(lines[2]), '  Assets:Crypto:Software:Tron:TFGqVk -4.746000 TRX');
});

test('beancount highlighting never loses characters and keeps directives', () => {
  const source = '1970-01-01 open Assets:Cash CNY\noption "title" "x"\n; comment\n\ninclude "month/2026-01.bean"';
  const lines = highlightBeancount(source);
  const parts = source.split('\n');
  assert.equal(lines.length, parts.length);
  for (const [i, line] of lines.entries()) assert.equal(text(line), parts[i]);
  assert.ok(kinds(lines[1]).includes('directive'));
  assert.ok(kinds(lines[2]).includes('comment'));
  assert.ok(kinds(lines[4]).includes('directive'));
});

test('yaml highlighting marks keys', () => {
  const lines = highlightYaml('personalRules:\n  - id: 晚餐\n    when: <a> == 1\n');
  assert.equal(lines[0][0].k, 'meta');
  assert.ok(lines[1].map((x) => x.k).includes('meta'));
  assert.equal(text(lines[1]), '  - id: 晚餐');
});

import { mappingModel, accountsModel, rolesOf, directionText } from '../src/mapping-view.mjs';

test('mappingModel reads slots, direction, vars and legs', () => {
  const doc = {
    shape: [{ locateHeader: { anchor: ['成交日期'] } }, { dropIf: '<成交金额> == "0"' }],
    template: {
      slots: { date: '<成交日期>', amount: '<成交金额>.number', metadata: { code: '<证券代码>' } },
      direction: { column: '<收/支>', outflow: ['支出', '/'], inflow: ['收入'], default: 'outflow' },
      vars: [{ vars: { security: 'SZ<证券代码>' } }, { when: '<股东账号> ~ "A"', vars: { security: 'SH<证券代码>' } }],
      legs: [{ id: '买入', when: '<操作> == "买"', legs: [{ role: 'cash', amount: '-<成交金额>', currency: 'CNY' }, { role: 'pnl' }] }],
    },
  };
  const m = mappingModel(doc);
  assert.equal(m.hasSlots, true);
  assert.deepEqual(m.slots.map((s) => s.field), ['date', 'amount']);
  assert.deepEqual(m.metadata, [{ key: 'code', expr: '<证券代码>' }]);
  assert.equal(m.direction.kind, 'column');
  assert.equal(m.direction.fallback, 'outflow');
  assert.equal(m.vars.length, 2);
  assert.equal(m.vars[1].when, '<股东账号> ~ "A"');
  assert.equal(m.legs[0].legs[1].role, 'pnl');
  assert.equal(m.shape.length, 2);
  assert.deepEqual(rolesOf(m), ['cash', 'pnl']);
  assert.deepEqual(rolesOf(mappingModel({ template: { slots: { date: 'x' } } })), ['self']);
  assert.equal(mappingModel({ template: { fileFormat: 'csv' } }).hasSlots, false);
});

test('directionText covers the three forms', () => {
  const t = (k) => translate('en', k);
  assert.match(directionText({ kind: 'columns', outflow: '<支出>', inflow: '<收入>' }, t), /outflow from <支出>/);
  assert.match(directionText({ kind: 'column', column: '<收/支>', outflow: ['支出'], inflow: ['收入'], fallback: 'outflow' }, t), /otherwise outflow/);
  assert.match(directionText({ kind: 'sign', invert: true }, t), /positive/);
});

test('accountsModel lists role bindings in order', () => {
  assert.deepEqual(accountsModel({ accounts: { self: 'Assets:Bank', fee: 'Expenses:Fee' } }), [
    { role: 'self', account: 'Assets:Bank' },
    { role: 'fee', account: 'Expenses:Fee' },
  ]);
  assert.deepEqual(accountsModel({}), []);
});
