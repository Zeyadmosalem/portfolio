/*
 * The Samboza portfolio demo's backend, running entirely in the visitor's browser.
 *
 * Postgres is PGlite (Postgres compiled to WebAssembly). It runs Samboza's real
 * migrations, so the real tables, functions, triggers and row-level security
 * decide what each demo user can see and do. A small fetch handler stands in
 * for Supabase's REST (PostgREST) and Auth (GoTrue) endpoints so the app's own
 * client code runs unchanged. The data is invented and stays in this browser:
 * nothing here can reach the family's real site or database.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { seed } from './seed.js';

export const DEMO_URL = 'https://samboza-demo.invalid';
const DB_NAME = 'samboza-demo-v1';
const SCHEMA_READY_KEY = 'samboza-demo-ready-v1';

let db = null;

/* ------------------------------------------------------------------ setup -- */

export async function startBackend({ prelude, migrations, onStatus = () => {} }) {
  const persisted = (() => { try { return localStorage.getItem(SCHEMA_READY_KEY) === '1'; } catch { return false; } })();
  try {
    db = await PGlite.create(`idb://${DB_NAME}`, { extensions: { pgcrypto } });
  } catch {
    db = await PGlite.create({ extensions: { pgcrypto } });              // private mode: memory only
  }
  const ready = persisted && (await db.query(`select to_regclass('public.families') is not null as ok`)).rows[0].ok;
  if (!ready) {
    const first = 'First visit only, this can take up to a minute.';
    onStatus(`Building the database from Samboza's migrations… ${first}`);
    await db.exec(prelude);
    let done = 0;
    for (const [name, sql] of migrations) {
      done += 1;
      onStatus(`Building the database: migration ${done} of ${migrations.length}… ${first}`);
      try {
        await db.exec(sql.replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, ''));
      } catch (e) {
        throw new Error(`Migration ${name} failed: ${e.message}`);
      }
    }
    onStatus(`Adding a made-up family and three months of records… ${first}`);
    await seed({ superuser: db, rpcAs, insertAs });
    try { localStorage.setItem(SCHEMA_READY_KEY, '1'); } catch { /* ignore */ }
  }
  installFetch();
}

export async function resetBackend() {
  try { localStorage.removeItem(SCHEMA_READY_KEY); } catch { /* ignore */ }
  try { await db?.close(); } catch { /* ignore */ }
  try {
    const dbs = indexedDB.databases ? await indexedDB.databases() : [{ name: `/pglite/${DB_NAME}` }];
    await Promise.all(dbs.filter((d) => d.name?.includes(DB_NAME)).map((d) => new Promise((res) => {
      const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res();
    })));
  } catch { /* ignore */ }
  for (const k of Object.keys(localStorage)) if (k.startsWith('samboza')) localStorage.removeItem(k);
}

/* ------------------------------------------------------------ as a user -- */

async function asClaims(claims, fn) {
  return db.transaction(async (tx) => {
    await tx.query(
      `select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', $3, true)`,
      [JSON.stringify(claims ?? {}), claims?.sub ?? '', claims?.sub ? 'authenticated' : 'anon']);
    await tx.exec(`set local role ${claims?.sub ? 'authenticated' : 'anon'}`);
    return fn(tx);
  });
}
const claimsFor = (userId, email) => ({ sub: userId, email, role: 'authenticated', aal: 'aal1', aud: 'authenticated' });

async function rpcAs(userId, fn, args) {
  return asClaims(claimsFor(userId), (tx) => callRpc(tx, fn, args));
}
async function insertAs(userId, table, row) {
  return asClaims(claimsFor(userId), (tx) => insertRows(tx, table, [row], {}));
}

/* ------------------------------------------------------- SQL generation -- */

const qi = (name) => `"${String(name).replace(/"/g, '""')}"`;

function splitTop(s) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function selectList(table, alias, select) {
  const items = splitTop(select || '*');
  return items.map((item) => {
    const embed = item.match(/^(?:(\w+):)?(\w+)(?:!(\w+))?\((.*)\)$/s);
    if (embed) {
      const [, as, target, hint, inner] = embed;
      const fk = hint ? hint.replace(new RegExp(`^${table}_`), '').replace(/_fkey$/, '') : `${target.replace(/s$/, '')}_id`;
      return `(select to_json(e) from (select ${selectList(target, 'x', inner)} from ${qi(target)} x
                 where x.id = ${alias}.${qi(fk)}) e) as ${qi(as || target)}`;
    }
    if (item === '*') return `${alias}.*`;
    const [as, col] = item.includes(':') ? item.split(':') : [item, item];
    return `${alias}.${qi(col.replace(/::\w+$/, ''))} as ${qi(as)}`;
  }).join(', ');
}

const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };

function whereClause(params, alias, values, types = {}) {
  const parts = [];
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    let v = raw; let negate = false;
    if (v.startsWith('not.')) { negate = true; v = v.slice(4); }
    const dot = v.indexOf('.');
    const op = v.slice(0, dot); const arg = v.slice(dot + 1);
    const col = `${alias}.${qi(key)}`;
    let sql;
    const type = types[key] ?? 'text';
    if (op === 'like' || op === 'ilike') {
      values.push(arg.replace(/\*/g, '%'));
      sql = `${col}::text ${OPS[op]} $${values.length}::text`;
    } else if (OPS[op]) {
      values.push(arg);
      sql = `${col} ${OPS[op]} $${values.length}::text::${type}`;
    } else if (op === 'is') {
      sql = `${col} is ${({ null: 'null', true: 'true', false: 'false', unknown: 'unknown' })[arg] ?? 'null'}`;
    } else if (op === 'in') {
      const list = arg.replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
      values.push(list);
      sql = `${col}::text = any($${values.length}::text[])`;
    } else if (op === 'cs') {
      values.push(arg);
      sql = `${col} @> $${values.length}::text::${type}`;
    } else {
      throw Object.assign(new Error(`Unsupported filter ${op} in the demo`), { code: 'PGRST100' });
    }
    parts.push(negate ? `not (${sql})` : sql);
  }
  return parts.length ? `where ${parts.join(' and ')}` : '';
}

function orderClause(order, alias) {
  if (!order) return '';
  return 'order by ' + order.split(',').map((o) => {
    const [col, ...mods] = o.split('.');
    let s = `${alias}.${qi(col)}`;
    if (mods.includes('desc')) s += ' desc';
    if (mods.includes('nullsfirst')) s += ' nulls first';
    if (mods.includes('nullslast')) s += ' nulls last';
    return s;
  }).join(', ');
}

async function selectRows(tx, table, params, { count } = {}) {
  const values = [];
  const where = whereClause(params, 't', values, await columnTypes(tx, table));
  const select = params.find(([k]) => k === 'select')?.[1] ?? '*';
  const order = orderClause(params.find(([k]) => k === 'order')?.[1], 't');
  const limit = params.find(([k]) => k === 'limit')?.[1];
  const offset = params.find(([k]) => k === 'offset')?.[1];
  const sql = `select coalesce(json_agg(r), '[]'::json) as j from (
      select ${selectList(table, 't', select)} from ${qi(table)} t ${where} ${order}
      ${limit ? `limit ${Number(limit)}` : ''} ${offset ? `offset ${Number(offset)}` : ''}) r`;
  const rows = (await tx.query(sql, values)).rows[0].j;
  let total = null;
  if (count) total = Number((await tx.query(`select count(*) as n from ${qi(table)} t ${where}`, values)).rows[0].n);
  return { rows, total };
}

const typeCache = new Map();
async function columnTypes(tx, table) {
  if (typeCache.has(table)) return typeCache.get(table);
  const r = await tx.query(`select attname, format_type(atttypid, atttypmod) as t from pg_attribute
    where attrelid = $1::text::regclass and attnum > 0 and not attisdropped`, [`public.${table}`]);
  const map = Object.fromEntries(r.rows.map((x) => [x.attname, x.t]));
  typeCache.set(table, map);
  return map;
}

const pkCache = new Map();
async function primaryKey(tx, table) {
  if (pkCache.has(table)) return pkCache.get(table);
  const r = await tx.query(`select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = $1::text::regclass and i.indisprimary`, [`public.${table}`]);
  const cols = r.rows.map((x) => x.attname);
  pkCache.set(table, cols);
  return cols;
}

async function insertRows(tx, table, rows, { upsert, ignore, onConflict, returning = true }) {
  const out = [];
  for (const row of rows) {
    const keys = Object.keys(row);
    const cols = keys.map(qi).join(', ');
    let sql = keys.length
      ? `insert into ${qi(table)} (${cols}) select ${cols} from json_populate_record(null::${qi(table)}, $1::json)`
      : `insert into ${qi(table)} default values`;
    if (upsert || ignore) {
      const target = onConflict ? onConflict.split(',') : await primaryKey(tx, table);
      const updates = keys.filter((k) => !target.includes(k)).map((k) => `${qi(k)} = excluded.${qi(k)}`);
      sql += ` on conflict (${target.map(qi).join(', ')}) ${ignore || !updates.length ? 'do nothing' : `do update set ${updates.join(', ')}`}`;
    }
    sql = `with ins as (${sql} returning *) select coalesce(json_agg(ins), '[]'::json) as j from ins`;
    const r = await tx.query(sql, keys.length ? [JSON.stringify(row)] : []);
    out.push(...r.rows[0].j);
  }
  return returning ? out : [];
}

async function updateRows(tx, table, params, patch) {
  const values = [JSON.stringify(patch)];
  const keys = Object.keys(patch);
  const where = whereClause(params, 't', values, await columnTypes(tx, table));
  const set = keys.map((k) => `${qi(k)} = p.${qi(k)}`).join(', ');
  const sql = `with upd as (update ${qi(table)} t set ${set} from json_populate_record(null::${qi(table)}, $1::json) p
      ${where} returning t.*) select coalesce(json_agg(upd), '[]'::json) as j from upd`;
  return (await tx.query(sql, values)).rows[0].j;
}

async function deleteRows(tx, table, params) {
  const values = [];
  const where = whereClause(params, 't', values, await columnTypes(tx, table));
  const sql = `with del as (delete from ${qi(table)} t ${where} returning t.*) select coalesce(json_agg(del), '[]'::json) as j from del`;
  return (await tx.query(sql, values)).rows[0].j;
}

const fnCache = new Map();
async function fnInfo(tx, name) {
  if (fnCache.has(name)) return fnCache.get(name);
  const r = await tx.query(`select p.proretset as set, t.typtype as kind, p.proargnames as names,
      array(select format_type(x, null) from unnest(p.proargtypes) x) as types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public' and p.proname = $1 limit 1`, [name]);
  const info = r.rows[0] ?? null;
  fnCache.set(name, info);
  return info;
}

async function callRpc(tx, name, args = {}) {
  const info = await fnInfo(tx, name);
  if (!info) throw Object.assign(new Error(`Could not find the function public.${name} in the schema cache`), { code: 'PGRST202' });
  const values = []; const named = [];
  for (const [k, v] of Object.entries(args ?? {})) {
    const idx = (info.names ?? []).indexOf(k);
    const type = idx >= 0 ? info.types[idx].replace(/^character(\[\])?$/, 'bpchar$1') : 'text';
    if (v === null || v === undefined) { named.push(`${qi(k)} => null::${type}`); continue; }
    if (type.endsWith('[]')) {
      values.push(JSON.stringify(v));
      named.push(`${qi(k)} => (select coalesce(array_agg(x), '{}')::${type} from json_array_elements_text($${values.length}::json) x)`);
    } else if (type === 'json' || type === 'jsonb') {
      values.push(JSON.stringify(v));
      named.push(`${qi(k)} => $${values.length}::${type}`);
    } else {
      values.push(typeof v === 'object' ? JSON.stringify(v) : String(v));
      named.push(`${qi(k)} => $${values.length}::text::${type}`);
    }
  }
  const call = `${qi(name)}(${named.join(', ')})`;
  if (info.set || info.kind === 'c') {
    const rows = (await tx.query(`select coalesce(json_agg(r), '[]'::json) as j from ${call} r`, values)).rows[0].j;
    if (info.set) return rows;
    const one = rows[0] ?? null;
    return one && Object.values(one).every((x) => x === null) ? null : one;
  }
  return (await tx.query(`select to_json(${call}) as j`, values)).rows[0].j;
}

/* ------------------------------------------------------------------- HTTP -- */

const json = (body, status = 200, headers = {}) => new Response(body === null ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});

function pgError(e) {
  const code = e.code ?? 'XX000';
  const status = code === 'PGRST116' ? 406 : code === '42501' ? 403 : code === 'PGRST202' ? 404
    : code.startsWith('23') ? 409 : 400;
  return json({ code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null }, status);
}

function decodeToken(header) {
  const token = (header ?? '').replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return claims.sub ? claims : null;
  } catch { return null; }
}

const b64url = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function makeToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...claimsFor(user.id, user.email), iat: now, exp: now + 7 * 86400, session_id: crypto.randomUUID?.() ?? String(now) };
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(claims)}.demo`;
}
function userJson(u) {
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: u.email_confirmed_at ?? new Date().toISOString(), confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: u.raw_user_meta_data ?? {}, identities: [], created_at: u.created_at, updated_at: new Date().toISOString(),
    factors: [] };
}
function sessionJson(u) {
  const now = Math.floor(Date.now() / 1000);
  return { access_token: makeToken(u), token_type: 'bearer', expires_in: 7 * 86400, expires_at: now + 7 * 86400,
    refresh_token: `demo-refresh.${u.id}`, user: userJson(u) };
}
async function findUser(where, value) {
  const r = await db.query(`select * from auth.users where ${where} = $1`, [value]);
  return r.rows[0] ?? null;
}
export async function demoUsers() {
  return (await db.query(`select u.email, p.display_name, p.role::text as role, p.is_operator
    from auth.users u join public.people p on p.auth_user_id = u.id order by p.member_no`)).rows;
}

async function handleAuth(url, init) {
  const path = url.pathname.replace(/^\/auth\/v1/, '');
  const method = (init.method ?? 'GET').toUpperCase();
  const body = init.body ? JSON.parse(init.body) : {};
  const headers = new Headers(init.headers);
  if (path === '/token') {
    const grant = url.searchParams.get('grant_type');
    let u = null;
    if (grant === 'password') u = await findUser('lower(email)', String(body.email ?? '').toLowerCase());
    if (grant === 'refresh_token') u = await findUser('id::text', String(body.refresh_token ?? '').replace(/^demo-refresh\./, ''));
    if (!u) return json({ error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    await db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [u.id]);
    return json(sessionJson(u));
  }
  const claims = decodeToken(headers.get('Authorization'));
  if (path === '/user') {
    if (!claims) return json({ code: 401, msg: 'invalid JWT', error_code: 'bad_jwt' }, 401);
    const u = await findUser('id::text', claims.sub);
    if (!u) return json({ code: 404, msg: 'User not found', error_code: 'user_not_found' }, 404);
    if (method === 'PUT' && body.data) await db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id = $1`, [u.id, JSON.stringify(body.data)]);
    return json(userJson(u));
  }
  if (path === '/logout') return new Response(null, { status: 204 });
  if (path === '/recover' || path === '/otp' || path === '/resend') return json({});
  if (path.startsWith('/factors')) return json({ all: [], totp: [], phone: [] });
  return json({ code: 404, msg: `${path} is not part of the demo` }, 404);
}

async function handleRest(url, init) {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const claims = decodeToken(headers.get('Authorization'));
  const prefer = headers.get('Prefer') ?? '';
  const wantsObject = (headers.get('Accept') ?? '').includes('vnd.pgrst.object');
  const path = url.pathname.replace(/^\/rest\/v1\//, '');
  const params = [...url.searchParams.entries()];
  const body = init.body ? JSON.parse(init.body) : null;

  try {
    return await asClaims(claims, async (tx) => {
      let rows; let total = null;
      if (path.startsWith('rpc/')) {
        const fn = path.slice(4);
        const args = method === 'GET' ? Object.fromEntries(params) : body;
        const result = await callRpc(tx, fn, args);
        if (method === 'HEAD') return new Response(null, { status: 200 });
        return json(result);
      }
      const table = path;
      if (method === 'GET' || method === 'HEAD') {
        ({ rows, total } = await selectRows(tx, table, params, { count: /count=(exact|planned|estimated)/.test(prefer) }));
      } else if (method === 'POST') {
        const list = Array.isArray(body) ? body : [body];
        rows = await insertRows(tx, table, list, {
          upsert: prefer.includes('resolution=merge-duplicates'), ignore: prefer.includes('resolution=ignore-duplicates'),
          onConflict: url.searchParams.get('on_conflict'),
        });
      } else if (method === 'PATCH') {
        rows = await updateRows(tx, table, params, body ?? {});
      } else if (method === 'DELETE') {
        rows = await deleteRows(tx, table, params);
      } else {
        return json({ message: `Method ${method} is not supported in the demo` }, 405);
      }
      const extra = {};
      if (total !== null) extra['Content-Range'] = rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}`;
      if (method === 'HEAD') return new Response(null, { status: 200, headers: extra });
      if (method !== 'GET' && !prefer.includes('return=representation')) return new Response(null, { status: method === 'POST' ? 201 : 204, headers: extra });
      if (wantsObject) {
        if (rows.length !== 1) {
          return json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned',
            details: `The result contains ${rows.length} rows`, hint: null }, 406);
        }
        return json(rows[0], 200, extra);
      }
      return json(rows, method === 'POST' ? 201 : 200, extra);
    });
  } catch (e) {
    return pgError(e);
  }
}

let queue = Promise.resolve();
function installFetch() {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!href.startsWith(DEMO_URL)) return realFetch(input, init);
    const url = new URL(href);
    if (input instanceof Request) {
      init = { method: input.method, headers: input.headers, ...init };
    }
    // One request at a time: PGlite is single-connection, like a tiny server.
    const run = async () => {
      if (init.body && typeof init.body !== 'string') init = { ...init, body: await new Response(init.body).text() };
      if (url.pathname.startsWith('/auth/v1')) return handleAuth(url, init);
      if (url.pathname.startsWith('/rest/v1')) return handleRest(url, init);
      return json({ message: 'Not part of the demo' }, 404);
    };
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  };
}

/* For the build-time check in check-seed.mjs. */
export const _internals = { useDb: (d) => { db = d; }, rpcAs, insertAs, selectRows, asClaims, callRpc };
