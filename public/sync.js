import { validate } from './model.js';

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, ordered(value[key])]),
    );
  return value;
}
export function sameInventory(a, b) {
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}
export function syncPlan(local, remote) {
  const cloud = remote.json.data;
  if (cloud && sameInventory(local.data, cloud)) return 'same';
  if (!cloud) {
    if (local.tag && local.tag !== '"empty"' && local.tag !== 'empty') return 'conflict';
    return local.revision !== local.synced || local.data.spools.length ? 'push' : 'empty';
  }
  if (local.base) {
    if (sameInventory(local.data, local.base)) return 'pull';
    if (sameInventory(cloud, local.base)) return 'push';
    return 'conflict';
  }
  if (local.revision === local.synced)
    return !local.tag && local.data.spools.length ? 'conflict' : 'pull';
  return local.tag === remote.tag || local.tag === '"' + remote.tag + '"' ? 'push' : 'conflict';
}
// Compare both copies to the last common value before accepting either change.
function choose(base, local, cloud, label) {
  if (sameInventory(local, cloud) || sameInventory(base, cloud)) return local;
  if (sameInventory(base, local)) return cloud;
  throw Error('两端均修改了「' + label + '」，请选择覆盖或恢复。');
}
export function mergeInventory(base, local, cloud) {
  const merged = { ...local };
  for (const key of ['spools', 'events', 'devices', 'places']) {
    const maps = [base?.[key] || [], local[key], cloud[key]].map(
      (rows) => new Map(rows.map((row) => [row.id, row])),
    );
    const ids = new Set([...maps[1].keys(), ...maps[2].keys()]);
    const rows = new Map();
    for (const id of ids) {
      const [before, here, there] = maps.map((map) => map.get(id));
      const picked = choose(
        before,
        here,
        there,
        here?.name || there?.name || here?.material || there?.material || id,
      );
      if (picked) rows.set(id, picked);
    }
    let order = ids;
    if (key === 'places' && base) {
      const common = base.places
        .map((row) => row.id)
        .filter((id) => maps[1].has(id) && maps[2].has(id));
      const existing = new Set(common);
      const sideOrder = (map) => [...map.keys()].filter((id) => existing.has(id));
      order = new Set([
        ...choose(common, sideOrder(maps[1]), sideOrder(maps[2]), '储存位置顺序'),
        ...ids,
      ]);
    }
    merged[key] = [...order].filter((id) => rows.has(id)).map((id) => rows.get(id));
  }
  merged.settings = Object.fromEntries(
    [...new Set([...Object.keys(local.settings), ...Object.keys(cloud.settings)])].flatMap(
      (key) => {
        const here = local.settings[key],
          there = cloud.settings[key];
        const value = base
          ? choose(base.settings[key], here, there, '设置 ' + key)
          : (here ?? there);
        return value === undefined ? [] : [[key, value]];
      },
    ),
  );
  return validate(merged);
}
