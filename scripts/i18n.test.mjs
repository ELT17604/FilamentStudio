import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale, currentLocale, t } from '../public/i18n.js';
import en from '../public/en.js';
import ja from '../public/ja.js';

test('saved language overrides browser locale, with English fallback', () => {
  assert.equal(resolveLocale('ja', ['zh-CN']), 'ja');
  assert.equal(resolveLocale('auto', ['ja-JP', 'en-US']), 'ja');
  assert.equal(resolveLocale('auto', ['zh-Hans-CN']), 'zh-CN');
  assert.equal(resolveLocale('invalid', ['fr-FR']), 'en');
  assert.equal(resolveLocale('auto', []), 'en');
  assert.equal(currentLocale(), 'en');
});

test('catalogs have equal coverage and interpolation preserves values', () => {
  assert.deepEqual(Object.keys(en), Object.keys(ja));
  assert.equal(ja['云同步'], 'クラウド同期');
  assert.match(
    t('当前在库 {count} 卷，净余量 {weight}。', { count: 3, weight: '2 kg' }),
    /3 spools, 2 kg/,
  );
});
