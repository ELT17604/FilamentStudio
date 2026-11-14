import { t, currentLocale, languagePreference, setLanguage } from './i18n.js';
import { openInventory, load, transact } from './inventory-store.js';
import {
  escapeHtml,
  button,
  select,
  option,
  options,
  field,
  actions,
  pageHeading,
  sectionHeading,
  emptyState,
} from './ui.js';
import { sameInventory, mergeInventory, syncPlan } from './sync.js';
import { sources, materialChoices, families } from './material-data.js';
import {
  allPlaces,
  active,
  validate,
  formatDate,
  storagePlaces,
  reorderStoragePlace,
  dryingAge,
  unopenedId,
  unopenedPlace,
} from './model.js';
import { materialGuide, dryingReminder, moistureSensitive, storageHumidity } from './guide.js';
const $ = (s) => document.querySelector(s);
const id = () => crypto.randomUUID(),
  now = () => new Date().toISOString();
const main = $('#app'),
  panel = $('#panel');
const builtBrands = [
  'Bambu Lab',
  'eSUN',
  'Polymaker',
  'SUNLU',
  'Overture',
  'ELEGOO',
  'Creality',
  'Prusament',
  'Forward AM',
  'UltiMaker',
];
const labels = {
  home: ['home', '首页'],
  stock: ['inventory_2', '库存'],
  places: ['shelves', '位置'],
  stats: ['bar_chart', '统计'],
  settings: ['settings', '设置'],
};
const icons = {
  home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3z',
  inventory_2: 'M4 8h16v12H4z M3 4h18v4H3z M9 12h6',
  shelves: 'M4 4h16v16H4z M4 12h16 M12 4v16',
  bar_chart: 'M4 20h16 M6 16v-5 M12 16V6 M18 16v-8',
  settings:
    'M19 12a7 7 0 1 1-14 0 7 7 0 1 1 14 0z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
  unopened: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10 M8 5l8 4',
  storage: 'M4 5h16v14H4z M4 10h16 M10 14h4',
};
const draw = (k) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' +
  icons[k] +
  '"/></svg>';
const rememberPlace = (d, k) => {
  if (k === unopenedId && !d.places.some((p) => p.id === k)) d.places.push({ ...unopenedPlace });
};
const events = {
  purchase: '新增',
  edit: '编辑',
  move: '移动',
  adjust: '余量调整',
  print: '打印消耗',
  loss: '损耗',
  audit: '盘点校正',
  dry: '烘干完成',
  archive: '归档',
  restore: '恢复',
};
const statusList = ['未开封', '已开封', '使用中', '烘干中', '已耗尽', '已归档', '已删除'];
const reel = (s) =>
  '<div aria-hidden="true" class="reel ' +
  (s ? '' : 'empty') +
  '"' +
  (s ? ' style="--c:' + escapeHtml(s.color) + '"' : '') +
  '></div>';
const grams = (n) => (n >= 1000 ? (n / 1000).toFixed(2).replace(/\.?0+$/, '') + ' kg' : n + ' g');
const pct = (s) => Math.round((s.remaining / s.weight) * 100);
const date = (x) =>
  x ? new Date(x).toLocaleString(currentLocale(), { hour12: false }) : t('尚未记录');
function dryAge(s, withDate = false) {
  const age = dryingAge(s.lastDry);
  if (!age) return t('<span class="dry-age">尚未烘干</span>');
  const elapsed =
    '<strong class="dry-age dry-age--' +
    age.tone +
    '">' +
    (age.days === 0 ? t('不到 1 天') : age.days + t(' 天前')) +
    '</strong>';
  return withDate
    ? '<time datetime="' +
        escapeHtml(s.lastDry) +
        '">' +
        escapeHtml(date(s.lastDry)) +
        '</time> <span aria-hidden="true">·</span> ' +
        elapsed
    : elapsed;
}
const localTime = () => {
  const t = new Date();
  return (
    formatDate() +
    'T' +
    [t.getHours(), t.getMinutes()].map((x) => String(x).padStart(2, '0')).join(':')
  );
};
let account = null,
  state,
  timer,
  camera,
  query = '',
  material = '',
  stockStatus = '',
  selectedPlace = '',
  message = '',
  conflict,
  busy = false,
  install,
  backupData;
let toastTimer;
let placementWarning;
let comparison;
const displayPlace = (place) =>
  ['unopened-stock', 'vacuum', 'external'].includes(place.id) ? t(place.name) : place.name;
const placeName = (key) => {
  const place = allPlaces(state.data).find((entry) => entry.id === key);
  if (!place) return t('未分配');
  return displayPlace(place);
};
const locations = (value = '') =>
  option('', t('未分配'), value) +
  allPlaces(state.data)
    .map((p) => option(p.id, displayPlace(p), value))
    .join('');
const spool = (d, k) => {
  const s = d.spools.find((x) => x.id === k);
  if (!s) throw Error(t('卷盘已不存在'));
  return s;
};
const name = (s) => s.name || s.material;
const activeRolls = () => state.data.spools.filter(active);
const alertFor = (s) => dryingReminder(s, state.data);
function toast(txt) {
  $('#toast').textContent = txt;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').textContent = ''), 4200);
}
function showError(e) {
  const el = $('#form-error');
  if (panel.open && el) el.textContent = t(e.message);
  else toast(t(e.message));
}
function log(d, s, type, before = '', after = '', note = '') {
  d.events.push({ id: id(), spool: s.id, type, before, after, note, at: now() });
}
const key = () => account?.id || 'local';
async function save(change, ok = t('已保存')) {
  state = await transact(key(), (v) => {
    change(v.data);
    validate(v.data);
    v.revision++;
    v.editedAt = Date.now();
    return v;
  });
  panel.close();
  render();
  toast(ok);
  if (account)
    syncStatus(conflict ? t('本机已保存，等待处理同步冲突。') : t('本机已保存，等待自动同步。'));
  queue();
}
function sheet(title, body) {
  stopCamera();
  if (!panel.open) panel.showModal();
  panel.innerHTML = sectionHeading(title, button(t('关闭'), 'close')) + body;
}
function form(title, kind, body, key = '', label = t('保存')) {
  sheet(
    title,
    '<form class="forms" data-kind="' +
      kind +
      '" data-key="' +
      escapeHtml(key) +
      '">' +
      body +
      '<p class="wide alert" role="alert" id="form-error"></p><div class="wide actions">' +
      button(t('取消'), 'close') +
      '<button class="primary">' +
      label +
      '</button></div></form>',
  );
}
function card(s) {
  return (
    '<article class="card spool stack"><div class="row">' +
    reel(s) +
    '<div><h3>' +
    escapeHtml(name(s)) +
    '</h3><small>' +
    escapeHtml(s.brand) +
    ' · ' +
    escapeHtml(s.colorName || s.color) +
    '</small></div><small>' +
    escapeHtml(t(s.status)) +
    '</small></div><small>' +
    escapeHtml(placeName(s.location)) +
    t('</small><p class="dry-summary muted">上次烘干 ') +
    dryAge(s) +
    '</p><div class="track" role="progressbar" aria-label="' +
    t('余量') +
    '" aria-valuenow="' +
    pct(s) +
    '"><i style="width:' +
    pct(s) +
    '%"></i></div><div class="row"><strong>' +
    grams(s.remaining) +
    '</strong><small>' +
    escapeHtml(t(s.confidence || '估算')) +
    ' · ' +
    pct(s) +
    '%</small></div>' +
    actions(button(t('详情'), 'detail', s.id), button(t('调余量'), 'amount', s.id)) +
    '</article>'
  );
}
const isAms2Pro = (dev) => dev.slots === 4 && /ams\s*2\s*pro/i.test(dev.name);
const inAms = (s, dev) =>
  Array.from({ length: dev.slots }, (_, i) => dev.id + '-' + (i + 1)).includes(s.location);
function ams(dev) {
  const slots = allPlaces(state.data).filter((p) =>
    Array.from({ length: dev.slots }, (_, i) => dev.id + '-' + (i + 1)).includes(p.id),
  );
  return (
    t('<article class="hero"><small>耗材装载 · 按 10% RH 估算 · ') +
    slots.filter((p) => state.data.spools.some((s) => s.location === p.id)).length +
    '/' +
    dev.slots +
    '</small><h2>' +
    escapeHtml(dev.name) +
    '</h2><div class="slots">' +
    slots
      .map((p, i) => {
        const s = state.data.spools.find((x) => x.location === p.id);
        return button(
          t('<small>槽位 ') +
            (i + 1) +
            '</small>' +
            reel(s) +
            '<strong>' +
            escapeHtml(s?.material || t('空槽位')) +
            '</strong>' +
            (s
              ? '<meter class="slot-remaining" min="0" max="100" value="' +
                pct(s) +
                '" aria-label="' +
                t('耗材余量') +
                '">' +
                pct(s) +
                '%</meter><small class="slot-brand">' +
                escapeHtml(s.brand) +
                '</small>'
              : ''),
          s ? 'detail' : 'load',
          s?.id || p.id,
          'slot',
        );
      })
      .join('') +
    '</div>' +
    (isAms2Pro(dev) && state.data.spools.some((s) => active(s) && inAms(s, dev))
      ? '<div class="ams-actions">' + button(t('批量记录完全烘干'), 'dry-batch', dev.id) + '</div>'
      : '') +
    '</article>'
  );
}
const grid = (rows) => '<div class="grid">' + rows.join('') + '</div>';
const metric = (l, n) =>
  '<article class="metric"><small>' + l + '</small><strong>' + n + '</strong></article>';
function home() {
  const list = activeRolls(),
    warnings = list.filter((s) => alertFor(s) || pct(s) <= state.data.settings.low);
  return (
    pageHeading(
      t('耗材工作室'),
      t('查看卷盘、装载位置和烘干记录。'),
      button(t('＋ 新增耗材'), 'new', '', 'primary'),
    ) +
    state.data.devices.slice(0, 1).map(ams).join('') +
    '<div class="metrics">' +
    metric(t('在库卷盘'), list.length) +
    metric(t('剩余净重'), grams(list.reduce((t, s) => t + s.remaining, 0))) +
    metric(t('待关注卷盘'), warnings.length) +
    '</div>' +
    actions(
      button(t('库存盘点'), 'audit'),
      button(t('提醒中心'), 'alerts'),
      button(t('库存总结'), 'summary'),
    ) +
    sectionHeading(t('最近录入'), t('<a href="#stock">查看库存 →</a>')) +
    (list.length
      ? grid(list.slice().reverse().slice(0, 3).map(card))
      : emptyState(
          t('还没有库存'),
          t('新增第一卷耗材，或从设置中恢复 JSON 备份。'),
          button(t('新增第一卷'), 'new', '', 'primary'),
        ))
  );
}
function stock() {
  const list = state.data.spools.filter(
    (s) =>
      (stockStatus ? s.status === stockStatus : !['已归档', '已删除'].includes(s.status)) &&
      (!material || s.family === material) &&
      (!selectedPlace || selectedPlace === s.location) &&
      (!query ||
        [name(s), s.brand, s.material, s.colorName, s.color]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  return (
    pageHeading(
      t('库存'),
      t('当前筛选 ') + list.length + t(' 卷'),
      button(t('＋ 新增'), 'new', '', 'primary'),
    ) +
    '<div class="filters">' +
    field(t('搜索'), 'search', query, 'search', 'placeholder="品牌、材料或颜色"') +
    select(
      t('材料大类'),
      'filter-material',
      option('', t('全部材料'), material) +
        options([...new Set(state.data.spools.map((s) => s.family))], material, t),
    ) +
    select(
      t('状态'),
      'filter-status',
      option('', t('当前卷盘'), stockStatus) + options(statusList, stockStatus, t),
    ) +
    select(
      t('位置'),
      'filter-place',
      option('', t('所有位置'), selectedPlace) +
        allPlaces(state.data)
          .map((p) => option(p.id, displayPlace(p), selectedPlace))
          .join(''),
    ) +
    '</div><div id="stock-results">' +
    (list.length ? grid(list.slice().reverse().map(card)) : emptyState(t('暂无符合条件的卷盘'))) +
    '</div>'
  );
}
function places() {
  const places = storagePlaces(state.data);
  return (
    pageHeading(
      t('位置'),
      t('查看 AMS 槽位、外挂料架和储存区。'),
      actions(button(t('新增 AMS'), 'device'), button(t('新增位置'), 'place', '', 'primary')),
    ) +
    state.data.devices.map(ams).join('') +
    sectionHeading(t('存储位置')) +
    '<div class="stack storage-list">' +
    places
      .map((p, index) => {
        const isUnopened = p.id === unopenedId,
          rh = storageHumidity(state.data, p.id);
        const order = (label, icon, action, disabled) =>
          '<button type="button" data-action="' +
          action +
          '" data-key="' +
          escapeHtml(p.id) +
          '" aria-label="' +
          label +
          ' ' +
          escapeHtml(displayPlace(p)) +
          '" ' +
          (disabled ? 'disabled' : '') +
          '>' +
          icon +
          '</button>';
        return (
          '<section class="card storage-card storage-row ' +
          (isUnopened ? 'unopened' : '') +
          '"><div class="place-icon">' +
          draw(isUnopened ? 'unopened' : 'storage') +
          '</div><div class="storage-text"><h3>' +
          escapeHtml(displayPlace(p)) +
          '</h3><small>' +
          state.data.spools.filter((s) => s.location === p.id).length +
          t(' 卷 · ') +
          (p.capacity ? t('容量 ') + p.capacity + t(' 卷') : t('不限容量')) +
          (rh !== null ? t(' · 按 ') + rh + t('% RH 估算') : '') +
          '</small></div>' +
          '<div class="actions storage-controls">' +
          button(t('查看卷盘'), 'filter-place', p.id) +
          order(t('上移'), '↑', 'place-up', index === 0) +
          order(t('下移'), '↓', 'place-down', index === places.length - 1) +
          '</div></section>'
        );
      })
      .join('') +
    '</div>'
  );
}
async function reorderPlace(key, offset) {
  await save((data) => reorderStoragePlace(data, key, offset), t('已更新位置顺序'));
  const controls = Array.from(
    main.querySelectorAll('[data-action="place-up"],[data-action="place-down"]'),
  ).filter((button) => button.dataset.key === key && !button.disabled);
  (
    controls.find((button) => button.dataset.action === (offset < 0 ? 'place-up' : 'place-down')) ||
    controls[0]
  )?.focus();
}
function summary() {
  const s = activeRolls(),
    sum = s.reduce((a, b) => a + b.remaining, 0);
  const used = state.data.events.filter(
    (x) => x.type === 'print' && Date.now() - Date.parse(x.at) < 30 * 86400000,
  );
  return [
    t('当前在库 {count} 卷，净余量 {weight}。', { count: s.length, weight: grams(sum) }),
    t('未开封 {count} 卷。', { count: s.filter((spool) => spool.status === '未开封').length }),
    t('近 30 天打印消耗 {amount}。', {
      amount: used.length
        ? grams(used.reduce((total, event) => total + event.before - event.after, 0))
        : t('数据不足'),
    }),
    t('待关注烘干 {count} 卷。', { count: s.filter(alertFor).length }),
  ].join('\n');
}
function stats() {
  const list = activeRolls(),
    table = Object.entries(
      list.reduce((acc, s) => {
        acc[s.family] ??= [0, 0];
        acc[s.family][0]++;
        acc[s.family][1] += s.remaining;
        return acc;
      }, Object.create(null)),
    );
  return (
    pageHeading(
      t('库存统计'),
      t('按本机卷盘和历史记录计算。'),
      button(t('生成总结'), 'summary', '', 'primary'),
    ) +
    grid(
      [
        [
          t('材料分布'),
          table
            .map(
              ([k, v]) =>
                '<div class="item row"><strong>' +
                escapeHtml(k) +
                '</strong><small>' +
                v[0] +
                t(' 卷 · ') +
                grams(v[1]) +
                '</small></div>',
            )
            .join('') || t('<p class="muted">暂无数据</p>'),
        ],
        [t('库存概况'), '<p style="white-space:pre-line">' + escapeHtml(summary()) + '</p>'],
      ].map(
        ([h2, contents]) =>
          '<article class="card stack"><h2>' + h2 + '</h2>' + contents + '</article>',
      ),
    )
  );
}
function settings() {
  return (
    pageHeading(t('设置'), t('管理云同步、备份和应用安装。')) +
    grid([
      '<section class="card stack"><h2>' +
        t('语言') +
        '</h2><p class="muted">' +
        t('仅保存在此设备。') +
        '</p>' +
        select(
          t('语言'),
          'language',
          [
            ['auto', t('跟随系统')],
            ['zh-CN', '简体中文'],
            ['en', 'English'],
            ['ja', '日本語'],
          ]
            .map(([value, label]) => option(value, label, languagePreference()))
            .join(''),
        ) +
        '</section>',
      t('<section class="card stack"><h2>云同步') +
        (account ? ' · ' + escapeHtml(account.name) : '') +
        '</h2><p class="muted" id="sync-state">' +
        escapeHtml(t(message) || t('登录后可在设备之间同步库存。')) +
        '</p>' +
        actions(
          button(t('登录 / 更新会话'), 'login', '', 'primary'),
          ...(account
            ? [
                button(t('手动同步'), 'sync'),
                button(t('导入本地库存'), 'adopt'),
                button(t('退出账号'), 'logout'),
              ]
            : []),
          ...(conflict ? [button(t('处理冲突'), 'conflict')] : []),
        ) +
        '</section>',
      t(
        '<section class="card stack"><h2>备份与恢复</h2><p class="muted">完整 JSON 包含卷盘、位置、设备及历史。</p>',
      ) +
        actions(
          button(t('导出 JSON'), 'backup', '', 'primary'),
          button(t('恢复备份'), 'restore'),
          button(t('导出库存 CSV'), 'csv'),
          ...(state.recovery ? [button(t('导出替换前快照'), 'recovery')] : []),
        ) +
        '</section>',
      t(
        '<section class="card stack"><h2>设备与安装</h2><p class="muted">业务数据保存在 IndexedDB。',
      ) +
        (navigator.serviceWorker?.controller ? t('离线资源已启用。') : t('离线资源尚未就绪。')) +
        '</p>' +
        actions(button(t('安装到主屏幕'), 'install'), button(t('请求持久存储'), 'persist')) +
        '</section>',
      t('<section class="card stack"><h2>提醒规则</h2><p class="muted">低余量 ≤ ') +
        state.data.settings.low +
        t('% · 普通存储烘干检查 ') +
        state.data.settings.dryDays +
        t(' 天</p>') +
        actions(button(t('编辑规则'), 'rules'), button(t('提醒中心'), 'alerts')) +
        '<a href="https://cdn1.bambulab.com/filament/filament-guide/bcv8wbl4hj/filament-guide-en.pdf" target="_blank" rel="noreferrer">Bambu Lab Filament Guide ↗</a></section>',
    ])
  );
}
function render() {
  if (!state) return;
  document.documentElement.lang = currentLocale();
  $('#brand-description').textContent = t('耗材工作室');
  $('#local-description').textContent = '● ' + t('设备本地存储');
  $('#nav').setAttribute('aria-label', t('主导航'));
  const [route, ref] = location.hash.slice(1).split('/');
  const p = route === 'guide' ? 'stock' : Object.hasOwn(labels, route) ? route : 'home';
  $('#nav').innerHTML = Object.entries(labels)
    .map(
      ([k, [icon, title]]) =>
        '<a href="#' +
        k +
        '" ' +
        (k === p ? 'aria-current="page"' : '') +
        '><span aria-hidden="true">' +
        draw(icon) +
        '</span>' +
        t(title) +
        '</a>',
    )
    .join('');
  const selected = route === 'guide' && state.data.spools.find((x) => x.id === ref);
  main.innerHTML = selected ? guidePage(selected) : { home, stock, places, stats, settings }[p]();
}
const optionsDamp = (value) =>
  option('no', t('未标记'), value ? 'yes' : 'no') +
  option('yes', t('发现受潮迹象'), value ? 'yes' : 'no');

const customChoice = '__filament_custom__';
const choiceOptions = (list, current) =>
  options(list, current, t) + option(customChoice, t('＋ 手动输入'), current);
const materialList = (data, family) => [
  ...new Set([
    ...(families[family] || []),
    ...materialChoices(family),
    ...(data.settings.customMaterials?.[family] || []),
    ...data.spools.filter((s) => s.family === family).map((s) => s.material),
  ]),
];
const editableChoice = (title, key, list, value) =>
  select(title, key, choiceOptions(list, value)) +
  t('<label class="wide" hidden>输入') +
  title +
  '<input name="' +
  key +
  'Custom" type="text" disabled></label>';
function toggleCustomChoice(control) {
  const custom = control.form.elements[control.name + 'Custom'];
  const enabled = control.value === customChoice;
  custom.closest('label').hidden = !enabled;
  custom.disabled = !enabled;
  custom.required = enabled;
  if (enabled) custom.focus();
}
function edit(s, copy = false) {
  const x = s || {
    family: 'PETG',
    material: 'PETG-MATTE',
    brand: 'Bambu Lab',
    weight: 1000,
    color: '#85bba6',
    bought: formatDate(),
    status: '未开封',
    rfid: '未知',
  };
  const brands = [
    ...new Set([
      ...builtBrands,
      ...(state.data.settings.customBrands || []),
      ...state.data.spools.map((s) => s.brand),
      x.brand,
    ]),
  ];
  const dict = [...new Set([...materialList(state.data, x.family), x.material])];
  form(
    s && !copy ? t('编辑耗材') : t('新增耗材'),
    'spool',
    editableChoice(t('品牌'), 'brand', brands, x.brand) +
      select(t('材料大类'), 'family', options(Object.keys(families), x.family, t)) +
      editableChoice(t('材料系列'), 'material', dict, x.material) +
      field(t('颜色名称'), 'colorName', x.colorName) +
      field(t('颜色'), 'color', x.color, 'color') +
      field(t('HEX 色值'), 'hex', x.color, 'text', 'pattern="#[0-9a-fA-F]{6}" required') +
      '<div class="wide">' +
      actions(button(t('摄像头取色'), 'camera'), button(t('相册取色'), 'album')) +
      '<input id="album" type="file" accept="image/*" hidden><div id="photo-preview"></div></div>' +
      field(t('初始净重量（g）'), 'weight', x.weight, 'number', 'min="1" max="100000" required') +
      field(
        t('购买日期'),
        'bought',
        copy ? formatDate() : x.bought,
        'date',
        'max="' + formatDate() + '" required',
      ) +
      select(t('位置'), 'location', locations(!s || copy ? unopenedId : x.location)) +
      (s && !copy ? '' : field(t('购买卷数'), 'qty', 1, 'number', 'min="1" max="100" required')) +
      t('<details class="wide"><summary>规格、采购与标签</summary><div class="forms">') +
      field(t('卷盘名称'), 'name', x.name) +
      field('SKU', 'sku', x.sku) +
      field(t('批次'), 'lot', x.lot) +
      field(t('开封日期'), 'opened', copy ? '' : x.opened, 'date', 'max="' + formatDate() + '"') +
      field(t('空盘重量（g）'), 'tare', x.tare, 'number', 'min="0"') +
      field(t('单卷价格（¥）'), 'price', x.price, 'number', 'min="0" step=".01"') +
      select(t('状态'), 'status', options(statusList.slice(0, 5), copy ? '未开封' : x.status, t)) +
      select(
        t('标签'),
        'rfid',
        options(
          ['未知', '无标签', 'Bambu 官方 RFID', '第三方 RFID/NFC', '第三方二维码'],
          x.rfid,
          t,
        ),
      ) +
      field(t('标签名称 / UID'), 'label', x.label) +
      field(t('备注'), 'note', x.note) +
      select(t('受潮迹象'), 'damp', optionsDamp(x.damp)) +
      '</div></details>',
    s && !copy ? s.id : '',
    t('保存卷盘'),
  );
}
function detailMetadata(s) {
  const rows = [
    [t('卷盘名称'), s.name],
    ['SKU', s.sku],
    [t('批次'), s.lot],
    [t('初始净重量'), grams(s.weight)],
    [t('空盘重量'), s.tare != null && s.tare !== '' ? s.tare + ' g' : ''],
    [t('购买日期'), s.bought],
    [t('开封日期'), s.opened],
    [t('单卷价格'), s.price != null && s.price !== '' ? '¥' + s.price : ''],
    [t('标签类型'), s.rfid === '未知' ? '' : t(s.rfid)],
    [t('标签名称 / UID'), s.label],
    [t('受潮迹象'), s.damp ? t('已标记') : ''],
  ].filter(([, value]) => String(value ?? '').trim());
  if (!rows.length && !s.note) return '';
  return (
    t('<section class="detail-metadata stack"><h3>规格、采购与标签</h3><dl>') +
    rows
      .map(
        ([label, value]) => '<div><dt>' + label + '</dt><dd>' + escapeHtml(value) + '</dd></div>',
      )
      .join('') +
    '</dl>' +
    (s.note
      ? t('<div class="detail-note"><small>备注</small><p>') + escapeHtml(s.note) + '</p></div>'
      : '') +
    '</section>'
  );
}
function detail(s) {
  const rows = state.data.events
    .filter((e) => e.spool === s.id)
    .slice()
    .reverse();
  const current = ['已归档', '已删除'].includes(s.status);
  sheet(
    escapeHtml(name(s)),
    '<div class="stack"><div class="row">' +
      reel(s) +
      '<div><h3>' +
      escapeHtml(s.brand) +
      ' · ' +
      escapeHtml(s.material) +
      '</h3><p class="muted">' +
      escapeHtml(s.colorName || s.color) +
      ' · ' +
      escapeHtml(t(s.status)) +
      '</p></div><strong>' +
      grams(s.remaining) +
      '</strong></div><p>' +
      escapeHtml(placeName(s.location)) +
      t('</p><p class="muted dry-summary">上次烘干 ') +
      dryAge(s, true) +
      t(' · 上次盘点 ') +
      escapeHtml(date(s.lastAudit)) +
      '</p>' +
      (current
        ? actions(button(t('恢复在库'), 'recover', s.id, 'primary'))
        : actions(
            button(t('调余量'), 'amount', s.id, 'primary'),
            button(t('移动 / 交换'), 'move', s.id),
            button(t('记烘干'), 'dry', s.id),
            button(t('编辑'), 'edit', s.id),
            button(t('复制'), 'duplicate', s.id),
            button(t('归档'), 'archive', s.id),
            button(t('移到回收站'), 'trash', s.id),
          )) +
      '<a class="guide-link" href="#guide/' +
      encodeURIComponent(s.id) +
      '">' +
      t('材料指南与烘干参数') +
      ' <span aria-hidden="true">↗</span></a>' +
      (alertFor(s) ? '<p class="alert">' + escapeHtml(alertFor(s)) + '</p>' : '') +
      detailMetadata(s) +
      t('<details><summary>操作历史 · ') +
      rows.length +
      '</summary>' +
      rows
        .slice(0, 100)
        .map(
          (e) =>
            '<div class="item"><strong>' +
            escapeHtml(t(events[e.type] || e.type)) +
            '</strong><p class="muted">' +
            escapeHtml(date(e.at)) +
            (typeof e.before === 'number' ? ' · ' + e.before + ' g → ' + e.after + ' g' : '') +
            (e.note ? ' · ' + escapeHtml(e.note) : '') +
            '</p></div>',
        )
        .join('') +
      '</details></div>',
  );
}
const sourceLinks = (keys) =>
  actions(
    ...[...new Set(keys)].map((k) => {
      const [label, url] = sources[k];
      return (
        '<a class="guide-link" target="_blank" rel="noopener noreferrer" href="' +
        escapeHtml(url) +
        '">' +
        escapeHtml(t(label)) +
        ' ↗</a>'
      );
    }),
  );
const withUnit = (value, unit) => (value == null ? t('未发布') : escapeHtml(value) + ' ' + unit);
function guidePage(s) {
  const g = materialGuide(s);
  const [level, health, control, airSources] = g.air;
  const profileLabel = g.official
    ? g.name
    : g.brandCategory
      ? g.name
      : g.sources.length
        ? t('对照条目 · ') + g.name
        : t('暂无该系列的已收录参数');
  const printFields = [
    [t('喷嘴温度'), withUnit(g.nozzleTemp, '°C')],
    [t('打印腔温'), escapeHtml(t(g.chamber))],
    [t('打印工艺封箱'), escapeHtml(t(g.enclosure))],
    [t('AMS 供料'), g.feed == null ? t('未列') : g.feed ? t('支持') : t('不支持')],
  ];
  return (
    t('<a class="back-link" href="#stock">← 返回库存</a>') +
    pageHeading(
      escapeHtml(s.material) + t(' 烘干打印参考'),
      escapeHtml(s.brand) + ' · ' + escapeHtml(t(profileLabel)),
      actions(
        button(t('卷盘详情'), 'guide-details', s.id),
        button(t('记录烘干'), 'dry', s.id, 'primary'),
      ),
    ) +
    '<div class="metrics">' +
    metric(g.temperature ? t(g.method) : t('烘干温度'), withUnit(g.temperature, '°C')) +
    metric(t('烘干时间'), withUnit(g.hours, t(g.durationUnit || '小时'))) +
    metric(t('打印前烘干'), escapeHtml(t(g.dry))) +
    '</div>' +
    grid([
      t('<article class="card stack"><h2>打印参数</h2><dl class="guide-facts">') +
        printFields
          .map(([key, value]) => '<div><dt>' + key + '</dt><dd>' + value + '</dd></div>')
          .join('') +
        '</dl></article>',
      t('<article class="card stack"><h2>健康与空气排放</h2><p><strong>排放关注度 · ') +
        escapeHtml(t(level)) +
        '</strong></p><p>' +
        escapeHtml(t(health)) +
        '</p><p>' +
        escapeHtml(t(control)) +
        '</p></article>',
    ]) +
    (g.ams
      ? t('<article class="card stack"><h2>AMS 2 Pro / AMS HT 烘干</h2><p>') +
        escapeHtml(t(g.ams)) +
        '</p></article>'
      : g.temperature && parseInt(g.temperature, 10) > 65
        ? t('<article class="card stack"><h2>AMS 2 Pro 烘干</h2><p>最高 65 °C · 低于该条目的 ') +
          withUnit(g.temperature, '°C') +
          t(' 烘干条件。</p></article>')
        : '') +
    t('<article class="card stack guide-sources"><h2>烘干记录与资料</h2><p>上次烘干 ') +
    escapeHtml(date(s.lastDry)) +
    '</p><p>' +
    escapeHtml(alertFor(s) || t('当前无烘干提醒。')) +
    '</p>' +
    sourceLinks([...g.sources, ...airSources]) +
    '</article>'
  );
}
function drySheet(s) {
  const g = materialGuide(s);
  const reference = g.temperature
    ? '<p class="muted">' +
      escapeHtml(t(g.name)) +
      ' · ' +
      escapeHtml(t(g.method)) +
      ' ' +
      withUnit(g.temperature, '°C') +
      ' / ' +
      withUnit(g.hours, t(g.durationUnit || '小时')) +
      t(' · 打印前烘干：') +
      escapeHtml(t(g.dry)) +
      '</p>'
    : t('<p class="muted">此系列未收录烘干参数。</p>');
  const fixed = g.official && /^\d+$/.test(g.temperature) && /^\d+$/.test(g.hours);
  form(
    t('记录烘干完成'),
    'dry',
    '<div class="wide stack">' +
      reference +
      (fixed
        ? actions(button(t('套用 ') + escapeHtml(t(g.method)) + t(' 参数'), 'guide-prefill', s.id))
        : '') +
      t('<p id="dry-device-note" class="muted" hidden>AMS 2 Pro 最高 65 °C。') +
      (g.ams ? ' ' + escapeHtml(t(g.ams)) : '') +
      '</p></div>' +
      deviceChoice(s) +
      '<div class="wide">' +
      button(t('一键记录完全烘干'), 'dry-now', s.id, 'primary') +
      '</div>' +
      t('<details class="wide"><summary>填写烘干参数</summary><div class="forms">') +
      field(t('完成时间'), 'at', localTime(), 'datetime-local', 'required') +
      field(t('时长（分钟）'), 'minutes', '', 'number', 'min="1"') +
      field(t('实际设定温度（°C）'), 'temperature', '', 'number', 'min="0"') +
      field(t('备注'), 'note') +
      '</div></details>',
    s.id,
    t('保存参数记录'),
  );
  $('#dry-device-note').hidden = !/ams\s*2\s*pro/i.test(dryDevice(panel.querySelector('form')));
}
function deviceChoice(s) {
  const current =
    state.data.devices.find((dev) => inAms(s, dev))?.name ||
    state.data.settings.lastDryer ||
    'AMS 2 Pro';
  return editableChoice(
    t('烘干设备'),
    'dryer',
    [
      ...new Set([
        'AMS 2 Pro',
        'AMS HT',
        '热风烘箱',
        ...state.data.devices.map((dev) => dev.name),
        current,
      ]),
    ],
    current,
  );
}
function dryDevice(form) {
  const device = form.elements.dryer;
  return (device.value === customChoice ? form.elements.dryerCustom.value : device.value).trim();
}
function recordDry(d, s, at, device, parameters = [], complete = false) {
  if (!active(s)) throw Error(t('卷盘已不在库存'));
  if (!s.lastDry || s.lastDry <= at) {
    s.lastDry = at;
    s.damp = false;
  }
  if (s.status === '烘干中') s.status = '已开封';
  log(
    d,
    s,
    'dry',
    '',
    at,
    [at, device, complete ? '完全烘干' : '', ...parameters].filter(Boolean).join(' · '),
  );
  d.settings.lastDryer = device;
}
function dryBatch(dev) {
  const rolls = state.data.spools
    .filter((s) => active(s) && inAms(s, dev))
    .sort((a, b) => a.location.localeCompare(b.location));
  form(
    t('批量记录完全烘干'),
    'dry-batch',
    '<p class="wide muted">' +
      escapeHtml(dev.name) +
      t(' · 选择本次已烘干的槽位</p>') +
      rolls
        .map(
          (s) =>
            '<label class="dry-roll wide"><input type="checkbox" name="roll" value="' +
            escapeHtml(s.id) +
            '" data-slot="' +
            escapeHtml(s.location) +
            '" checked><span>' +
            escapeHtml(placeName(s.location)) +
            ' · ' +
            escapeHtml(name(s)) +
            '</span></label>',
        )
        .join(''),
    dev.id,
    t('记录选中的卷盘'),
  );
}
function amount(s) {
  form(
    t('调整 ') + escapeHtml(name(s)) + t(' 余量'),
    'amount',
    '<div class="wide actions">' +
      [100, 75, 50, 25, 10, 0]
        .map((p) => button(p + '%', 'preset', Math.round((s.weight * p) / 100)))
        .join('') +
      '</div>' +
      field(t('余量滑块'), 'slider', s.remaining, 'range', 'min="0" max="' + s.weight + '"') +
      field(
        t('净余量（g）'),
        'grams',
        s.remaining,
        'number',
        'min="0" max="' + s.weight + '" required',
      ) +
      select(t('确定方式'), 'confidence', options(['估算', '称重'], s.confidence, t)) +
      select(
        t('原因'),
        'reason',
        [
          ['adjust', t('手动调整')],
          ['print', t('打印消耗')],
          ['loss', t('损耗')],
          ['audit', t('盘点校正')],
        ]
          .map(([k, v]) => option(k, v))
          .join(''),
      ) +
      field(t('含盘总重（可选 g）'), 'gross', '', 'number', 'min="0"') +
      field(t('空盘重量（g）'), 'tare', s.tare, 'number', 'min="0"') +
      field(t('备注'), 'note'),
    s.id,
  );
}
function moveForm(s) {
  form(
    t('移动 ') + escapeHtml(name(s)),
    'move',
    select(t('目标位置'), 'location', locations(s.location)) +
      select(t('目标单卷槽位被占用'), 'swap', options(['停止并提示', '交换位置'], undefined, t)),
    s.id,
    t('确认移动'),
  );
}
class ExternalPlacementWarning extends Error {}
function move(d, s, to, swap = false, allowExternal = false) {
  if (to !== s.location && to === 'external' && moistureSensitive(s) && !allowExternal)
    throw new ExternalPlacementWarning();

  if (s.location === to) return;
  const p = allPlaces(d).find((x) => x.id === to);
  if (to && !p) throw Error(t('位置已不存在'));
  const other = p?.capacity === 1 && d.spools.find((x) => x.id !== s.id && x.location === to);
  if (other) {
    if (!swap) throw Error(t('目标槽位已占用，需明确选择交换'));
    if (s.location === 'external' && moistureSensitive(other) && !allowExternal)
      throw new ExternalPlacementWarning();
    log(d, other, 'move', other.location, s.location);
    other.location = s.location;
  }
  rememberPlace(d, to);
  log(d, s, 'move', s.location, to);
  s.location = to;
}
function download(value, name, type) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function digest(data) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data))),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
async function exportData(data) {
  download(
    JSON.stringify(
      {
        app: 'Filament Studio',
        schemaVersion: 1,
        data,
        sha256: await digest(data),
        savedAt: now(),
      },
      null,
      2,
    ),
    'FilamentStudio_Backup_' + formatDate() + '.json',
    'application/json',
  );
}
// Backup imports and cloud reconciliation use different merge policies.
function mergeImportedInventory(current, extra) {
  const next = structuredClone(current);
  for (const k of ['spools', 'events', 'devices', 'places']) {
    const ids = new Set(next[k].map((x) => x.id));
    for (const x of extra[k]) if (!ids.has(x.id)) next[k].push(x);
  }
  next.settings.customBrands = [
    ...new Set([...(next.settings.customBrands || []), ...(extra.settings.customBrands || [])]),
  ];
  next.settings.customMaterials = Object.fromEntries(
    Object.keys(families).map((family) => [
      family,
      [
        ...new Set([
          ...(next.settings.customMaterials?.[family] || []),
          ...(extra.settings.customMaterials?.[family] || []),
        ]),
      ],
    ]),
  );
  return validate(next);
}
function syncStatus(text) {
  message = text;
  if ($('#sync-state')) $('#sync-state').textContent = text;
}
async function api(path, method = 'GET', data, headers = {}) {
  const r = await fetch('./api/' + path, {
    method,
    cache: 'no-store',
    headers: {
      ...(path === 'inventory' && account ? { 'X-Inventory-Account': account.id } : {}),
      ...headers,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const json = await r.json();
  if (!r.ok)
    throw Object.assign(Error(t(json.error)), {
      status: r.status,
      retry: +r.headers.get('Retry-After') || 0,
    });
  return { json, tag: r.headers.get('X-Inventory-Version') || r.headers.get('ETag') };
}
const quietMs = 8000;
function queue(ms = quietMs) {
  clearTimeout(timer);
  if (account && !conflict && !comparison)
    timer = setTimeout(() => {
      if (busy) queue(1000);
      else sync();
    }, ms);
}
async function attach(user) {
  clearTimeout(timer);
  account = user;
  conflict = null;
  comparison = null;
  if (user) localStorage.setItem('filament-account', JSON.stringify(user));
  else localStorage.removeItem('filament-account');
  state = await load(key());
  render();
}
// Advance the shared base only after the server acknowledges a version.
async function acknowledge(
  k,
  local,
  remote,
  data = local.data,
  replace = false,
  committed = false,
) {
  state = await transact(k, (v) => {
    if (replace && v.revision !== local.revision) {
      if (committed) return { ...v, pending: null, needsReview: true };
      throw Error(t('本机库存已变更，请重新同步'));
    }
    const revision = replace ? v.revision + 1 : v.revision;
    return {
      ...v,
      revision,
      synced: replace ? revision : local.revision,
      tag: remote.tag,
      base: structuredClone(data),
      ...(replace ? { data, recovery: v.data } : {}),
      pending: null,
      needsReview: false,
    };
  });
  if (state.revision !== state.synced) queue();
}
async function push(k, local, remote, data, replace = false) {
  const op =
    local.pending?.localRevision === local.revision && sameInventory(local.pending.data, data)
      ? local.pending.id
      : id();
  await transact(k, (v) => {
    if (v.revision !== local.revision) throw Error(t('本机库存已变更，请重新同步'));
    return {
      ...v,
      pending: { id: op, localRevision: local.revision, data: structuredClone(data), replace },
    };
  });
  const result = await api('inventory', 'PUT', data, {
    'X-Inventory-Version': remote.tag,
    'If-Match': remote.tag,
    'X-Operation-Id': op,
  });
  if (!result.tag) throw Error(t('云端未返回写入版本，请重试同步'));
  await acknowledge(k, local, result, data, replace, true);
}
function syncedMessage() {
  conflict = null;
  comparison = null;
  render();
  syncStatus(
    state.needsReview
      ? t('本机在同步期间有新编辑，等待重新比较。')
      : state.revision === state.synced
        ? t('已同步 · ') + new Date().toLocaleTimeString(currentLocale())
        : t('本机有新编辑，等待下一次自动同步。'),
  );
  if (state.needsReview || state.revision !== state.synced) queue();
}
async function sync(manual = false) {
  if (!account || busy || (!manual && (conflict || comparison))) return;
  if (!navigator.onLine) {
    syncStatus(t('当前离线，修改已保存在本机。'));
    if (manual) toast(message);
    return;
  }
  const k = key();
  busy = true;
  try {
    let local = await load(k);
    let remaining = quietMs - (Date.now() - (local.editedAt || 0));
    if (!manual && local.revision !== local.synced && remaining > 0) {
      queue(remaining);
      return;
    }
    const remote = await api('inventory');
    if (!remote.tag) throw Error(t('云端未返回库存版本'));
    local = await load(k);
    // The write may have succeeded even when its response never reached the client.
    if (local.pending && local.pending.id === remote.json.operation && remote.json.data) {
      const pending = local.pending;
      await acknowledge(
        k,
        { ...local, revision: pending.localRevision },
        remote,
        validate(remote.json.data),
        pending.replace,
        true,
      );
      local = state;
    }
    state = local;
    const plan = local.needsReview ? 'conflict' : syncPlan(local, remote);
    if (manual) {
      comparison = { ...remote, localRevision: local.revision };
      showConflict();
      return;
    }
    if (plan === 'conflict') {
      comparison = null;
      conflict = { ...remote, localRevision: local.revision };
      syncStatus(t('本机和云端版本已分叉，请选择同步方式。'));
      render();
      return;
    }
    remaining = quietMs - (Date.now() - (local.editedAt || 0));
    if (plan === 'push' && remaining > 0) {
      queue(remaining);
      return;
    }
    if (plan === 'empty') {
      syncStatus(t('云端尚无库存。已有未登录库存时，可在设置中选择导入本地库存。'));
      return;
    }
    if (plan === 'push') await push(k, local, remote, local.data);
    if (plan === 'pull') await acknowledge(k, local, remote, validate(remote.json.data), true);
    if (
      plan === 'same' &&
      (local.tag !== remote.tag || local.revision !== local.synced || !local.base || local.pending)
    ) {
      await acknowledge(k, local, remote, local.data);
    }
    syncedMessage();
  } catch (e) {
    syncStatus(t(e.message));
    if (e.status === 409) queue(1000);
    else if (e.retry) queue(e.retry * 1000);
    else if (!e.status || e.status >= 500) queue(30000);
    if (manual) toast(t(e.message));
  } finally {
    busy = false;
  }
}
function showConflict() {
  const selected = comparison || conflict;
  if (!selected) return;
  const cloud = selected.json.data;
  sheet(
    t('手动同步'),
    t('<div class="stack"><p>本机 ') +
      state.data.spools.length +
      t(' 卷 · ') +
      (cloud
        ? t('云端 ') +
          cloud.spools.length +
          t(' 卷 · 版本 ') +
          escapeHtml(selected.json.revision ?? '—')
        : t('云端尚无库存')) +
      '</p>' +
      t('<p class="muted">合并会保留双方的独立修改。同一条记录在两端都改过时，会提示冲突。</p>') +
      actions(
        button(t('导出本机备份'), 'backup'),
        button(t('合并并更新云端'), 'resolve', 'merge', 'primary'),
        ...(cloud ? [button(t('用云端恢复本机'), 'resolve', 'remote')] : []),
        button(t('用本机覆盖云端'), 'resolve', 'local'),
      ) +
      '<p class="alert" id="form-error"></p></div>',
  );
}
async function resolve(mode) {
  const saved = comparison || conflict;
  if (busy || !saved) return;
  busy = true;
  const k = key();
  try {
    const local = await load(k),
      remote = await api('inventory');
    state = local;
    if (!remote.tag) throw Error(t('云端未返回库存版本'));
    if (saved.tag !== remote.tag || saved.localRevision !== local.revision) {
      comparison = { ...remote, localRevision: local.revision };
      showConflict();
      throw Error(t('同步预览已更新，请重新选择同步方式。'));
    }
    const cloud = remote.json.data;
    if (mode === 'remote') {
      if (!cloud) throw Error(t('云端尚无可恢复库存'));
      await acknowledge(k, local, remote, validate(cloud), true);
    } else {
      const merged =
        mode === 'merge' && cloud
          ? mergeInventory(local.base, local.data, validate(cloud))
          : local.data;
      const replace = !sameInventory(merged, local.data);
      if (sameInventory(merged, cloud)) await acknowledge(k, local, remote, merged, replace);
      else await push(k, local, remote, merged, replace);
    }
    panel.close();
    syncedMessage();
  } catch (e) {
    if (e.status === 409) {
      conflict = saved;
      comparison = null;
      syncStatus(t('写入期间云端版本已变化，请重新选择同步方式。'));
      try {
        const [remote, local] = await Promise.all([api('inventory'), load(k)]);
        comparison = { ...remote, localRevision: local.revision };
      } catch {
        showConflict();
        throw Error(t('暂时无法读取最新云端版本。可保留本机数据，稍后重新打开手动同步。'));
      }
      showConflict();
      throw Error(t('已加载最新云端版本。请在下方重新选择同步方式。'));
    }
    throw e;
  } finally {
    busy = false;
  }
}
function stopCamera() {
  camera?.getTracks().forEach((t) => t.stop());
  camera = null;
}
function pick(source, x = 0.5, y = 0.5) {
  const w = source.videoWidth || source.naturalWidth,
    height = source.videoHeight || source.naturalHeight;
  if (!w || !height) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 7;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    source,
    Math.max(0, Math.min(w - 7, w * x - 3)),
    Math.max(0, Math.min(height - 7, height * y - 3)),
    7,
    7,
    0,
    0,
    7,
    7,
  );
  const data = ctx.getImageData(0, 0, 7, 7).data;
  const rgb = [0, 1, 2]
    .map((ch) =>
      Math.round(
        Array.from({ length: 49 }, (_, i) => data[i * 4 + ch]).reduce((n, x) => n + x, 0) / 49,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
  $('[name=color]').value = $('[name=hex]').value = '#' + rgb;
  toast(t('已取色 #') + rgb);
}
function confirm(title, text, action, key) {
  sheet(
    title,
    '<div class="stack"><p>' +
      text +
      '</p>' +
      actions(button(t('取消'), 'close'), button(t('确认'), 'confirm-' + action, key, 'primary')) +
      '<p class="alert" id="form-error"></p></div>',
  );
}
const acts = {
  'place-up': (key) => reorderPlace(key, -1),
  'place-down': (key) => reorderPlace(key, 1),
  'cancel-external': () => restorePlacementForm(),
  'confirm-external': async () => {
    const pending = placementWarning;
    if (!pending) return;
    restorePlacementForm();
    try {
      await submit(pending, true);
    } catch (e) {
      showError(e);
    }
  },
  close: () => panel.close(),
  new: () => edit(),
  detail: (k) => detail(spool(state.data, k)),
  edit: (k) => edit(spool(state.data, k)),
  duplicate: (k) => edit(spool(state.data, k), true),
  amount: (k) => amount(spool(state.data, k)),
  move: (k) => moveForm(spool(state.data, k)),
  preset: (k) => {
    $('[name=slider]').value = $('[name=grams]').value = k;
    $('[name=gross]').value = '';
  },
  load: (k) => {
    const list = activeRolls().filter((s) => s.location !== k);
    if (!list.length)
      return sheet(
        t('装入 AMS'),
        emptyState(
          t('暂无可装入卷盘'),
          t('先新增一卷库存。'),
          button(t('新增耗材'), 'new', '', 'primary'),
        ),
      );
    form(
      t('装入 ') + escapeHtml(placeName(k)),
      'load',
      select(
        t('选择卷盘'),
        'spool',
        list.map((s) => option(s.id, name(s) + ' · ' + s.brand)).join(''),
      ),
      k,
      t('装入'),
    );
  },
  device: () =>
    form(
      t('新增 AMS'),
      'device',
      field(t('设备名称'), 'name', '', 'text', 'required') +
        field(t('槽位数量'), 'slots', 4, 'number', 'min="1" max="16" required'),
    ),
  place: () =>
    form(
      t('新增位置'),
      'place',
      field(t('位置名称'), 'name', '', 'text', 'required') +
        field(t('容量（0 为不限）'), 'capacity', 0, 'number', 'min="0" max="10000" required'),
    ),
  'filter-place': (k) => {
    query = '';
    material = '';
    stockStatus = '';
    selectedPlace = k;
    if (location.hash === '#stock') render();
    else location.hash = 'stock';
  },
  'guide-details': (k) => detail(spool(state.data, k)),
  'guide-prefill': (k) => {
    const g = materialGuide(spool(state.data, k));
    if (!g?.official) return;
    const select = $('[name=dryer]');
    if (!Array.from(select.options).some((o) => o.value === g.method))
      select.add(new Option(g.method, g.method));
    select.value = g.method;
    toggleCustomChoice(select);
    $('#dry-device-note').hidden = true;
    panel.querySelector('details')?.setAttribute('open', '');
    $('[name=temperature]').value = parseInt(g.temperature, 10);
    $('[name=minutes]').value = parseInt(g.hours, 10) * (g.durationUnit === '分钟' ? 1 : 60);
  },
  dry: (k) => drySheet(spool(state.data, k)),
  'dry-now': (k) => {
    const device = dryDevice(panel.querySelector('form'));
    if (!device) throw Error(t('请选择或输入烘干设备'));
    return save((d) => recordDry(d, spool(d, k), now(), device, [], true), t('已记录完全烘干'));
  },
  'dry-batch': (k) => {
    const dev = state.data.devices.find((d) => d.id === k);
    if (dev && isAms2Pro(dev)) dryBatch(dev);
  },
  audit: () =>
    sheet(
      t('库存盘点'),
      activeRolls().length
        ? actions(button(t('批量确认已盘点'), 'audit-all')) +
            activeRolls()
              .map(
                (s) =>
                  '<div class="row item audit-roll"><div><strong>' +
                  escapeHtml(name(s)) +
                  '</strong><p class="muted">' +
                  escapeHtml(placeName(s.location)) +
                  ' · ' +
                  grams(s.remaining) +
                  t('</p><p class="muted dry-summary">上次烘干 ') +
                  dryAge(s, true) +
                  '</p></div>' +
                  button(t('盘点'), 'audit-single', s.id) +
                  '</div>',
              )
              .join('')
        : emptyState(t('没有待盘点卷盘')),
    ),
  'audit-all': () => confirm(t('确认盘点'), t('将所有在库卷盘标记为已核对。'), 'audit-all'),
  'confirm-audit-all': () =>
    save((d) => {
      for (const s of d.spools.filter(active)) {
        s.lastAudit = now();
        log(d, s, 'audit', s.remaining, s.remaining);
      }
    }, t('已核对在库卷盘')),
  'audit-single': (k) =>
    form(
      t('核对 ') + escapeHtml(name(spool(state.data, k))),
      'audit',
      field(
        t('当前余量（g）'),
        'grams',
        spool(state.data, k).remaining,
        'number',
        'min="0" required',
      ) + select(t('当前位置'), 'location', locations(spool(state.data, k).location)),
      k,
      t('确认盘点'),
    ),
  alerts: () => {
    const rows = activeRolls()
      .map((s) => [
        s,
        [alertFor(s), pct(s) <= state.data.settings.low ? t('余量偏低') : '']
          .filter(Boolean)
          .join(' · '),
      ])
      .filter(([, v]) => v);
    sheet(
      t('提醒中心'),
      rows
        .map(
          ([s, v]) =>
            '<div class="row item"><div><strong>' +
            escapeHtml(name(s)) +
            '</strong><p class="muted">' +
            escapeHtml(v) +
            '</p></div>' +
            button(t('查看'), 'detail', s.id) +
            '</div>',
        )
        .join('') || emptyState(t('当前没有待处理提醒')),
    );
  },
  rules: () =>
    form(
      t('提醒规则'),
      'rules',
      field(
        t('低余量阈值（%）'),
        'low',
        state.data.settings.low,
        'number',
        'min="0" max="100" required',
      ) +
        field(
          t('普通存储烘干检查（天）'),
          'dryDays',
          state.data.settings.dryDays,
          'number',
          'min="1" max="3650" required',
        ),
    ),
  archive: (k) => confirm(t('归档卷盘'), t('将卷盘移出当前库存并保留历史。'), 'archive', k),
  trash: (k) => confirm(t('移到回收站'), t('可通过库存中的「已删除」筛选恢复。'), 'trash', k),
  'confirm-archive': (k) => setStatus(k, '已归档'),
  'confirm-trash': (k) => setStatus(k, '已删除'),
  recover: (k) =>
    save((d) => {
      const s = spool(d, k);
      log(d, s, 'restore', s.status, '已开封');
      s.status = s.remaining ? '已开封' : '已耗尽';
    }, t('已恢复')),
  summary: () =>
    sheet(
      t('库存总结'),
      '<textarea id="summary" rows="7" readonly>' +
        escapeHtml(summary()) +
        '</textarea>' +
        actions(button(t('复制总结'), 'copy-summary'), button(t('导出库存 CSV'), 'csv')),
    ),
  'copy-summary': async () => {
    const t = $('#summary');
    try {
      await navigator.clipboard.writeText(t.value);
      toast(t('已复制'));
    } catch {
      t.select();
      toast(t('文本已选中，可用系统菜单复制'));
    }
  },
  backup: () => exportData(state.data),
  recovery: () => exportData(state.recovery),
  csv: () => {
    const cell = (v) =>
      '"' +
      String(v ?? '')
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      [t('品牌'), t('材料'), t('颜色'), t('购买日期'), t('净余量 g'), t('位置'), t('状态')],
      ...state.data.spools
        .filter((s) => s.status !== '已删除')
        .map((s) => [
          s.brand,
          s.material,
          s.colorName || s.color,
          s.bought,
          s.remaining,
          placeName(s.location),
          s.status,
        ]),
    ];
    download(
      '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n'),
      'FilamentStudio_Inventory_' + formatDate() + '.csv',
      'text/csv;charset=utf-8',
    );
  },
  restore: () => {
    backupData = null;
    sheet(
      t('恢复库存'),
      t(
        '<label>选择备份文件<input type="file" id="restore-file" accept=".json,application/json"></label><p role="alert" class="alert" id="form-error"></p><div id="import-actions"></div>',
      ),
    );
  },
  'merge-backup': () =>
    save((d) => Object.assign(d, mergeImportedInventory(d, backupData)), t('已合并备份')),
  'replace-backup': () => confirm(t('替换设备库存'), t('替换前会在本机保留快照。'), 'backup'),
  'confirm-backup': async () => {
    state = await transact(key(), (v) => ({
      ...v,
      recovery: v.data,
      data: backupData,
      revision: v.revision + 1,
      editedAt: Date.now(),
    }));
    panel.close();
    render();
    queue();
    toast(t('已恢复备份'));
  },
  login: () =>
    form(
      t('登录云同步'),
      'login',
      field(t('用户名'), 'username', account?.name, 'text', 'autocomplete="username" required') +
        field(t('密码'), 'password', '', 'password', 'autocomplete="current-password" required') +
        t('<p class="wide muted">账号库存与本地库存分别保存。你可以在登录后导入本地库存。</p>'),
      '',
      t('登录'),
    ),
  logout: async () => {
    if (busy) throw Error(t('请等待同步完成'));
    await api('logout', 'POST');
    await attach(null);
    syncStatus(t('已退出云同步。'));
  },
  sync: () => sync(true),
  conflict: () => sync(true),
  resolve,
  adopt: () =>
    confirm(
      t('导入本地库存'),
      t('将此设备未登录时保存的库存并入当前账号，并自动同步到云端。'),
      'adopt',
    ),
  'confirm-adopt': async () => {
    const previous = await load('local');
    if (!previous.data.spools.length) throw Error(t('此设备无可导入的本地卷盘'));
    await save((d) => {
      Object.assign(d, mergeImportedInventory(d, previous.data));
      d.settings.guestImported = true;
    }, t('已导入本地库存，等待自动同步'));
  },
  persist: async () =>
    toast(
      (await navigator.storage?.persist?.())
        ? t('已获得浏览器持久存储权限')
        : t('浏览器未授予持久存储权限'),
    ),
  install: async () => {
    if (matchMedia('(display-mode:standalone)').matches || navigator.standalone)
      return toast(t('当前已在独立窗口运行'));
    if (install) {
      const promptEvent = install;
      install = null;
      try {
        const choice = await promptEvent.prompt();
        if ((choice ?? (await promptEvent.userChoice))?.outcome === 'accepted')
          toast(t('安装请求已接受。Chrome 会继续处理安装。'));
        return;
      } catch {
        // A consumed prompt cannot be reused. Fall back to browser instructions.
      }
    }
    sheet(
      t('添加到主屏幕'),
      '<p>' +
        (/iPhone|iPad|iPod/.test(navigator.userAgent)
          ? t('在 Safari 分享菜单中选择「添加到主屏幕」。')
          : t('在 Chrome 浏览器菜单选择「安装应用」或「添加到主屏幕」。')) +
        '</p><p class="muted">' +
        (/Android/i.test(navigator.userAgent)
          ? t('若安装长时间未完成，请在普通 Chrome 标签页重新打开本站，再从菜单安装。')
          : '') +
        '</p>',
    );
  },
  camera: async () => {
    if (!navigator.mediaDevices?.getUserMedia) return toast(t('摄像头不可用，可用相册取色'));
    stopCamera();
    const preview = $('#photo-preview');
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!panel.open || !preview.isConnected) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      camera = media;
      preview.innerHTML =
        '<video autoplay muted playsinline></video>' +
        actions(button(t('取中心色'), 'capture'), button(t('停止摄像头'), 'stop-camera'));
      $('video').srcObject = media;
    } catch {
      toast(t('摄像头不可用，可从相册取色'));
    }
  },
  capture: () => pick($('video')),
  'stop-camera': () => {
    stopCamera();
    $('#photo-preview').replaceChildren();
  },
  album: () => $('#album').click(),
};
function setStatus(k, status) {
  return save((d) => {
    const s = spool(d, k);
    log(d, s, 'archive', s.status, status);
    s.location = '';
    s.status = status;
  }, status);
}
function restorePlacementForm() {
  if (!placementWarning) return;
  const form = placementWarning;
  placementWarning = null;
  panel.querySelector('.placement-warning')?.remove();
  for (const child of Array.from(panel.children)) child.hidden = false;
  form.querySelector('button:not([type])').focus();
}
function warnExternal(form) {
  placementWarning = form;
  for (const child of Array.from(panel.children)) child.hidden = true;
  const confirmation = document.createElement('section');
  confirmation.className = 'stack placement-warning';
  confirmation.innerHTML =
    t(
      '<h2>确认放到外挂</h2><p>这次操作会把易吸湿耗材放到外挂料架。外挂按 70% RH 估算，长时间存放可能增加受潮风险。</p>',
    ) +
    actions(
      button(t('返回修改'), 'cancel-external'),
      button(t('确认放到外挂'), 'confirm-external', '', 'primary'),
    );
  panel.prepend(confirmation);
  confirmation.querySelector('button').focus();
}
async function submit(form, allowExternal = false) {
  const { kind, key: k } = form.dataset,
    f = new FormData(form),
    v = (n) => String(f.get(n) || '').trim(),
    n = (k) => Number(v(k));
  if (kind === 'login') {
    if (busy) throw Error(t('请等待正在进行的同步'));
    busy = true;
    try {
      const r = await api('login', 'POST', {
        username: v('username'),
        password: String(f.get('password') || ''),
      });
      await attach(r.json);
      panel.close();
    } finally {
      busy = false;
    }
    await sync();
    const guest = await load('local');
    if (account && guest.data.spools.length && !state.data.settings.guestImported) acts.adopt();
    return;
  }
  await save((d) => {
    if (kind === 'spool') {
      const weight = n('weight'),
        qty = k ? 1 : n('qty');
      const brand = v('brand') === customChoice ? v('brandCustom') : v('brand');
      const enteredMaterial = v('material') === customChoice ? v('materialCustom') : v('material');
      const material = enteredMaterial.toUpperCase() === 'PLA-SIL' ? 'PLA-SILK' : enteredMaterial;
      if (!brand || !material || !Number.isInteger(qty) || qty < 1 || qty > 100)
        throw Error(t('请检查品牌、材料和卷数'));
      if (v('opened') && v('opened') < v('bought')) throw Error(t('开封时间早于购买日期'));
      for (let i = 0; i < qty; i++) {
        const s = k
          ? spool(d, k)
          : { id: id(), remaining: weight, created: now(), confidence: '估算', location: '' };
        if (weight < s.remaining) throw Error(t('初始净重量不能低于当前余量'));
        Object.assign(
          s,
          Object.fromEntries(
            [
              'family',
              'colorName',
              'bought',
              'name',
              'sku',
              'lot',
              'opened',
              'tare',
              'price',
              'status',
              'rfid',
              'label',
              'note',
            ].map((a) => [a, v(a)]),
          ),
          { brand, weight, color: v('hex'), material, modified: now() },
        );
        if (s.status === '未开封' && s.opened) s.status = '已开封';
        s.damp = v('damp') === 'yes';
        if (s.status === '已耗尽') s.remaining = 0;
        if (!k) d.spools.push(s);
        move(d, s, v('location'), false, allowExternal);
        log(d, s, k ? 'edit' : 'purchase');
      }
      if (v('brand') === customChoice)
        d.settings.customBrands = [...new Set([...(d.settings.customBrands || []), brand])];
      if (v('material') === customChoice) {
        const family = v('family');
        d.settings.customMaterials ??= {};
        d.settings.customMaterials[family] = [
          ...new Set([...(d.settings.customMaterials[family] || []), material]),
        ];
      }
    }
    if (kind === 'amount' || kind === 'audit') {
      const s = spool(d, k),
        old = s.remaining;
      if (v('gross') && !v('tare')) throw Error(t('需要空盘重量才能从总重计算净余量'));
      const value = v('gross') ? n('gross') - n('tare') : n('grams');
      const reason = kind === 'audit' ? 'audit' : v('reason');
      if (value < 0 || value > s.weight || (['print', 'loss'].includes(reason) && value > old))
        throw Error(t('净余量不符合有效范围'));
      s.remaining = value;
      if (!value) s.status = '已耗尽';
      else if (s.status === '已耗尽') s.status = '已开封';
      if (v('confidence')) s.confidence = v('gross') ? '称重' : v('confidence');
      if (v('tare')) s.tare = v('tare');
      if (reason === 'audit') s.lastAudit = now();
      if (kind === 'audit') move(d, s, v('location'), false, allowExternal);
      log(d, s, reason, old, value, v('note'));
    }
    if (kind === 'move')
      move(d, spool(d, k), v('location'), v('swap') === '交换位置', allowExternal);
    if (kind === 'load') move(d, spool(d, v('spool')), k);
    if (kind === 'device') d.devices.push({ id: id(), name: v('name'), slots: n('slots') });
    if (kind === 'place') d.places.push({ id: id(), name: v('name'), capacity: n('capacity') });
    if (kind === 'dry') {
      const dryer = dryDevice(form);
      if (!dryer) throw Error(t('请选择或输入烘干设备'));
      if (/ams\s*2\s*pro/i.test(dryer) && n('temperature') > 65)
        throw Error(t('AMS 2 Pro 的最高烘干温度为 65 °C，请核对设备和实际记录'));
      const t = new Date(v('at'));
      if (t > Date.now() + 60000) throw Error(t('完成时间晚于当前时间'));
      recordDry(d, spool(d, k), t.toISOString(), dryer, [
        v('minutes') ? v('minutes') + ' 分钟' : '',
        v('temperature') ? v('temperature') + ' °C' : '',
        v('note'),
      ]);
    }
    if (kind === 'dry-batch') {
      const dev = d.devices.find((x) => x.id === k);
      const checked = Array.from(form.querySelectorAll('[name=roll]:checked'));
      if (!dev || !isAms2Pro(dev) || !checked.length)
        throw Error(t('请至少选择一个 AMS 2 Pro 槽位'));
      const at = now();
      for (const control of checked) {
        const s = spool(d, control.value);
        if (s.location !== control.dataset.slot || !inAms(s, dev))
          throw Error(t('槽位卷盘已变更，请重新打开批量记录'));
        recordDry(d, s, at, dev.name, [], true);
      }
    }
    if (kind === 'rules') Object.assign(d.settings, { low: n('low'), dryDays: n('dryDays') });
  });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (e.target.closest('.guide-link')) panel.close();
  if (b && Object.hasOwn(acts, b.dataset.action))
    Promise.resolve()
      .then(() => acts[b.dataset.action](b.dataset.key))
      .catch(showError);
});
document.addEventListener('submit', (e) => {
  e.preventDefault();
  const button = e.target.querySelector('button:not([type])');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  submit(e.target)
    .catch((e2) => {
      if (e2 instanceof ExternalPlacementWarning) warnExternal(e.target);
      else showError(e2);
    })
    .finally(() => {
      if (button) button.disabled = false;
    });
});
document.addEventListener('input', (e) => {
  const input = e.target;
  if (input.name === 'search') {
    query = input.value;
    const temp = document.createElement('template');
    temp.innerHTML = stock();
    $('#stock-results').replaceChildren(...temp.content.querySelector('#stock-results').childNodes);
    $('.heading p').textContent = temp.content.querySelector('.heading p').textContent;
  }
  if (input.name === 'slider') {
    $('[name=grams]').value = input.value;
    $('[name=gross]').value = '';
  }
  if (input.name === 'grams' && $('[name=slider]')) $('[name=slider]').value = input.value;
  if (input.name === 'color') $('[name=hex]').value = input.value;
});
document.addEventListener('change', async (e) => {
  const input = e.target;
  try {
    if (input.name === 'language') {
      setLanguage(input.value);
      message = '';
      render();
      $('[name=language]')?.focus();
      return;
    }
    if (input.name === 'filter-status') {
      stockStatus = input.value;
      render();
    }
    if (input.name === 'filter-material') {
      material = input.value;
      render();
    }
    if (input.name === 'filter-place') {
      selectedPlace = input.value;
      render();
    }
    if (['dryer', 'dryerCustom'].includes(input.name) && $('#dry-device-note')) {
      if (input.name === 'dryer') toggleCustomChoice(input);
      $('#dry-device-note').hidden = !/ams\s*2\s*pro/i.test(dryDevice(input.form));
    }
    if (input.form?.dataset.kind === 'spool' && ['brand', 'material'].includes(input.name))
      toggleCustomChoice(input);
    if (input.form?.dataset.kind === 'spool' && input.name === 'family') {
      const material = input.form.elements.material;
      material.innerHTML = choiceOptions(materialList(state.data, input.value));
      input.form.elements.materialCustom.value = '';
      toggleCustomChoice(material);
    }
    if (input.id === 'album' && input.files[0]) {
      stopCamera();
      const photo = new Image(),
        url = URL.createObjectURL(input.files[0]);
      try {
        photo.src = url;
        await photo.decode();
        photo.alt = t('点选要提取的颜色');
        $('#photo-preview').replaceChildren(photo);
        photo.onclick = (e) => pick(photo, e.offsetX / photo.width, e.offsetY / photo.height);
        pick(photo);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (input.id === 'restore-file' && input.files[0]) {
      backupData = null;
      $('#import-actions').replaceChildren();
      const x = JSON.parse(await input.files[0].text());
      if (
        x.app !== 'Filament Studio' ||
        x.schemaVersion !== 1 ||
        x.sha256 !== (await digest(x.data))
      )
        throw Error(t('文件格式、版本或校验不匹配'));
      backupData = validate(x.data);
      $('#import-actions').innerHTML =
        t('<p>当前 ') +
        state.data.spools.length +
        t(' 卷 · 备份 ') +
        backupData.spools.length +
        t(' 卷</p>') +
        actions(
          button(t('合并并保留现有记录'), 'merge-backup', '', 'primary'),
          button(t('替换库存'), 'replace-backup'),
        );
    }
  } catch (error) {
    showError(error);
  }
});
panel.addEventListener('close', () => {
  stopCamera();
  placementWarning = null;
  if (comparison) {
    comparison = null;
    queue();
  }
});
panel.addEventListener('cancel', (e) => {
  if (placementWarning) {
    e.preventDefault();
    restorePlacementForm();
  }
});
window.addEventListener('hashchange', render);
window.addEventListener('online', () => queue(30));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) queue(30);
});
setInterval(() => {
  if (!document.hidden && navigator.onLine && !panel.open) sync();
}, 60000);
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  install = e;
});
if (navigator.serviceWorker) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', render);
}
async function boot() {
  try {
    await openInventory();
    let prior;
    try {
      prior = JSON.parse(localStorage.getItem('filament-account') || 'null');
    } catch {
      prior = null;
    }
    await attach(prior && /^user[1-9]\d{0,2}$/.test(prior.id) ? prior : null);
    try {
      const session = await api('session');
      if (session.json.id !== account?.id) await attach(session.json);
      await sync();
    } catch (e) {
      syncStatus(
        e.status === 401 && account
          ? t('会话已过期，仍可使用该账号的离线库存。')
          : e.status === 401
            ? t('登录后可同步跨设备库存。')
            : e.message,
      );
    }
  } catch (e) {
    main.textContent = t(e.message);
  }
}
document.documentElement.lang = currentLocale();
main.textContent = t('正在打开库存') + '…';
window.addEventListener('languagechange', () => {
  if (languagePreference() === 'auto') {
    setLanguage('auto');
    render();
  }
});
boot();
