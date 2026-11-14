import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialGuide, dryingReminder, moistureSensitive } from '../public/guide.js';
import { sources, materialChoices, families } from '../public/material-data.js';

const guide = (brand, family, material) => materialGuide({ brand, family, material });
test('every inventory preset resolves a referenced material profile', () => {
  for (const [family, items] of Object.entries(families)) {
    for (const material of [...items, ...materialChoices(family)]) {
      const brands = [
        'Bambu Lab',
        'Creality',
        'Polymaker',
        'eSUN',
        'Prusament',
        'Recreus',
        'Forward AM',
      ];
      const row = brands
        .map((brand) => guide(brand, family, material))
        .find((profile) => profile.sources.length);
      assert.ok(row, material);
      for (const key of [...row.sources, ...row.air[3]]) assert.ok(sources[key], key);
    }
  }
});
test('Bambu PETG matte and HF have distinct pre-drying rules', () => {
  const matte = guide('Bambu Lab', 'PETG', 'PETG-MATTE');
  const hf = guide('拓竹', 'PETG', 'PETG HF');
  assert.equal(matte.dry, '可选');
  assert.equal(hf.dry, '要求');
  assert.equal(matte.chamber, '35–50 °C（推荐范围）');
  assert.match(matte.ams, /60 °C/);
  assert.equal(
    dryingReminder(
      { brand: 'Other', family: 'PETG', material: 'PETG HF', status: '未开封' },
      { settings: { dryDays: 30 } },
    ),
    '',
  );
  assert.match(
    dryingReminder(
      { brand: 'Bambu Lab', family: 'PETG', material: 'PETG HF', status: '未开封' },
      { settings: { dryDays: 30 } },
    ),
    /打印前要求/,
  );
});
test('brand aliases, engineering ranges and exposure classifications', () => {
  assert.equal(guide('Creativity', 'PETG', 'Hyper PETG').nozzleTemp, '220–260');
  assert.equal(guide('Polymaker', 'PA', 'Fiberon PA6-CF20').temperature, '100');
  assert.equal(guide('Bambu Lab', 'PPS', 'PPS-CF').chamber, '60–90 °C');
  assert.equal(guide('eSUN', '其他', 'HIPS').air[0], '较高');
  assert.equal(guide('Unknown', '其他', 'Unknown').air[0], '未分级');
});

test('humidity-sensitive rolls can be classified before moving to the external holder', () => {
  assert.equal(
    moistureSensitive({ brand: 'Bambu Lab', family: 'PETG', material: 'PETG Matte' }),
    true,
  );
  assert.equal(
    moistureSensitive({ brand: 'Bambu Lab', family: 'PLA', material: 'PLA-BASIC' }),
    false,
  );
  assert.equal(
    moistureSensitive({ brand: 'Bambu Lab', family: '其他', material: 'Support for PLA' }),
    true,
  );
});
