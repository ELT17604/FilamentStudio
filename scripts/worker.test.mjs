import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes, randomUUID, createHash } from 'node:crypto';
import { onRequest } from '../functions/api/[[path]].js';
import { fresh } from '../public/model.js';
class Bucket {
  entries = new Map();
  async get(key) {
    const e = this.entries.get(key);
    if (!e) return null;
    return {
      ...e,
      body: new Response(e.value).body,
      text: async () => e.value,
      json: async () => JSON.parse(e.value),
    };
  }
  async put(key, value, options = {}) {
    const old = this.entries.get(key),
      condition = options.onlyIf;
    if (condition instanceof Headers && condition.get('If-None-Match') === '*' && old) return null;
    if (condition?.etagMatches !== undefined && old?.etag !== condition.etagMatches) return null;
    const etag = createHash('md5').update(value).digest('hex'),
      result = { value, etag, httpEtag: '"' + etag + '"', customMetadata: options.customMetadata };
    this.entries.set(key, result);
    return result;
  }
}
const password = 'local-test-only-' + randomUUID();
const verifier = () => {
  const salt = randomBytes(16);
  return [
    'pbkdf2',
    '100000',
    salt.toString('base64url'),
    pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64url'),
  ].join('$');
};
const env = {
  BUCKET: new Bucket(),
  SESSION_SECRET: randomBytes(32).toString('base64url'),
  user1: 'first',
  pw1: verifier(),
  user2: 'second',
  pw2: verifier(),
};
const base = 'https://filament.example';
function call(path, method = 'GET', data, headers = {}) {
  return onRequest({
    request: new Request(base + path, {
      method,
      headers: { Origin: base, ...headers },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
    env,
  });
}
const login = async (username) => {
  const r = await call('/api/login', 'POST', { username, password });
  assert.equal(r.status, 200);
  return r.headers.get('Set-Cookie').split(';')[0];
};
assert.equal((await call('/api/inventory')).status, 401);
assert.equal(
  (
    await call(
      '/api/login',
      'POST',
      { username: 'first', password },
      { Origin: 'https://foreign.example' },
    )
  ).status,
  403,
);
const first = await login('first'),
  second = await login('second');
const get = (Cookie) =>
  call('/api/inventory', 'GET', null, {
    Cookie,
    'X-Inventory-Account': Cookie === first ? 'user1' : 'user2',
  });
const put = (Cookie, tag, data, operation = randomUUID()) =>
  call('/api/inventory', 'PUT', data, {
    Cookie,
    'X-Inventory-Account': Cookie === first ? 'user1' : 'user2',
    'If-Match': tag,
    'X-Operation-Id': operation,
  });
assert.equal(
  (await call('/api/inventory', 'GET', null, { Cookie: second, 'X-Inventory-Account': 'user1' }))
    .status,
  401,
);
const original = await get(first),
  data = fresh(),
  op = randomUUID();
assert.equal(original.headers.get('ETag'), '"empty"');
const written = await put(first, '"empty"', data, op);
assert.equal(written.status, 200);
assert.equal((await put(first, '"empty"', data, op)).status, 200);
assert.equal((await put(first, '"empty"', data)).status, 409);
assert.equal((await get(second)).headers.get('ETag'), '"empty"');
const etag = written.headers.get('ETag');
const dataA = structuredClone(data),
  dataB = structuredClone(data);
dataA.settings.low = 12;
dataB.settings.low = 16;
const results = await Promise.all([put(first, etag, dataA), put(first, etag, dataB)]);
assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
assert.equal((await put(first, etag, { schema: 1 })).status, 400);
assert.ok(env.BUCKET.entries.has('recovery/user1/1.json'));
// A second client signed into the same account reads and can replace A's cloud data.
const getSame = (Cookie) =>
  call('/api/inventory', 'GET', null, { Cookie, 'X-Inventory-Account': 'user1' });
const bClient = await login('first');
const read = await getSame(bClient);
const version = read.headers.get('X-Inventory-Version');
assert.ok(version);
const replacement = structuredClone(data);
replacement.settings.low = 18;
const writeVersion = (Cookie, tag, body, operation) =>
  call('/api/inventory', 'PUT', body, {
    Cookie,
    'X-Inventory-Account': 'user1',
    'X-Inventory-Version': tag,
    'If-Match': 'W/"transformed-by-proxy"',
    'X-Operation-Id': operation,
  });
const attempt = randomUUID();
const successful = await writeVersion(bClient, version, replacement, attempt);
assert.equal(successful.status, 200);
assert.equal((await writeVersion(bClient, version, replacement, attempt)).status, 200);
assert.equal(
  (await getSame(first)).headers.get('X-Inventory-Version'),
  successful.headers.get('X-Inventory-Version'),
);
assert.equal((await (await getSame(first)).json()).data.settings.low, 18);
const expired = await writeVersion(first, version, data, randomUUID());
assert.equal(expired.status, 409);
assert.equal((await expired.json()).code, 'inventory_conflict');
const review = await getSame(first);
assert.equal(
  (await writeVersion(first, review.headers.get('X-Inventory-Version'), data, randomUUID())).status,
  200,
);
const statuses = [];
for (let i = 0; i < 25; i++) statuses.push((await put(first, '"empty"', data)).status);
assert.ok(statuses.includes(429));
console.log(
  'Passed: Pages handler, authentication, account isolation, conditional write, idempotency, concurrent write, invalid data, snapshot and rate limit',
);
