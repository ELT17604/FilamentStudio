export const unopenedId = 'unopened-stock';
export const unopenedPlace = { id: unopenedId, name: '未开封储存区', capacity: 0 };
export const storagePlaces = (d) =>
  d.places.some((p) => p.id === unopenedId) ? d.places : [{ ...unopenedPlace }, ...d.places];
export function reorderStoragePlace(data, id, offset) {
  const places = storagePlaces(data).slice();
  const from = places.findIndex((place) => place.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= places.length) return;
  [places[from], places[to]] = [places[to], places[from]];
  data.places = places;
}
export function dryingAge(timestamp, now = Date.now()) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return null;
  const days = Math.max(0, Math.floor((now - time) / 86400000));
  return { days, tone: days < 7 ? 'recent' : days < 30 ? 'aging' : 'old' };
}
// Keep defaults identical for browsers and Pages Functions.
export const fresh = () => ({
  schema: 1,
  spools: [],
  events: [],
  devices: [{ id: 'ams-1', name: 'AMS 2 Pro', slots: 4 }],
  places: [
    { id: 'external', name: 'X2D 外挂料架', capacity: 1 },
    { id: 'vacuum', name: '真空存储', capacity: 0 },
  ],
  settings: { dryDays: 30, low: 10 },
});
export const allPlaces = (d) => [
  ...d.devices.flatMap((x) =>
    Array.from({ length: x.slots }, (_, n) => ({
      id: x.id + '-' + (n + 1),
      name: x.name + ' / ' + (n + 1),
      capacity: 1,
    })),
  ),
  ...storagePlaces(d),
];
export const active = (s) => !['已归档', '已删除', '已耗尽'].includes(s.status);
export function validate(d) {
  if (
    !d ||
    d.schema !== 1 ||
    !d.settings ||
    !Number.isInteger(d.settings.low) ||
    d.settings.low < 0 ||
    d.settings.low > 100 ||
    !Number.isInteger(d.settings.dryDays) ||
    d.settings.dryDays < 1
  )
    throw Error('库存结构无效');
  for (const key of ['spools', 'events', 'devices', 'places']) {
    const rows = d[key];
    if (
      !Array.isArray(rows) ||
      rows.length > 50000 ||
      rows.some((x) => !x || typeof x.id !== 'string' || !x.id) ||
      new Set(rows.map((x) => x.id)).size !== rows.length
    )
      throw Error('记录无效或重复');
  }
  if (
    d.devices.some(
      (x) =>
        !Number.isInteger(x.slots) || x.slots < 1 || x.slots > 16 || typeof x.name !== 'string',
    ) ||
    d.places.some(
      (x) => !Number.isInteger(x.capacity) || x.capacity < 0 || typeof x.name !== 'string',
    )
  )
    throw Error('位置数据无效');
  const places = new Map(allPlaces(d).map((x) => [x.id, x])),
    use = new Map();
  for (const x of d.spools) {
    if (
      !Number.isFinite(x.weight) ||
      x.weight <= 0 ||
      !Number.isFinite(x.remaining) ||
      x.remaining < 0 ||
      x.remaining > x.weight ||
      !/^#[0-9a-f]{6}$/i.test(x.color) ||
      !x.brand ||
      !x.material ||
      !['未开封', '已开封', '使用中', '烘干中', '已耗尽', '已归档', '已删除'].includes(x.status) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(x.bought)
    )
      throw Error('卷盘数据无效');
    if (x.location) {
      const p = places.get(x.location);
      if (!p) throw Error('存放位置无效');
      const amount = (use.get(p.id) || 0) + 1;
      if (p.capacity && amount > p.capacity) throw Error(p.name + ' 已满');
      use.set(p.id, amount);
    }
  }
  const ids = new Set(d.spools.map((x) => x.id));
  if (
    d.events.some(
      (x) => !ids.has(x.spool) || !Number.isFinite(Date.parse(x.at)) || typeof x.type !== 'string',
    )
  )
    throw Error('操作历史无效');
  return d;
}
export const formatDate = () => {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((i) => String(i).padStart(2, '0'))
    .join('-');
};
