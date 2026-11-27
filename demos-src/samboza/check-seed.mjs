// Runs the migrations and the demo seed in Node, then prints what each role sees.
// Usage: node check-seed.mjs /path/to/samboza
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { _internals } from './backend.js';
import { seed, DEMO_PEOPLE } from './seed.js';
const repo = process.argv[2];
const dir = `${repo}/supabase/migrations`;
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(readFileSync(new URL('./prelude.sql', import.meta.url), 'utf8'));
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort())
  await db.exec(readFileSync(`${dir}/${f}`, 'utf8').replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, ''));
_internals.useDb(db);
const t0 = Date.now();
await seed({ superuser: db, rpcAs: _internals.rpcAs, insertAs: _internals.insertAs });
console.log('seeded in', Date.now() - t0, 'ms');
for (const tbl of ['journals', 'remittances', 'allowances', 'car_days', 'loans', 'member_payments'])
  console.log(tbl, (await db.query(`select count(*) n from ${tbl}`)).rows[0].n);
const users = (await db.query(`select u.id, p.display_name, p.family_id from auth.users u join people p on p.auth_user_id = u.id`)).rows;
for (const u of users) {
  const r = await _internals.asClaims({ sub: u.id }, async (tx) => ({
    journals: (await tx.query('select count(*) n from journals')).rows[0].n,
    people: (await tx.query('select count(*) n from people')).rows[0].n,
    payments: (await tx.query('select count(*) n from member_payments')).rows[0].n,
    role: await _internals.callRpc(tx, 'my_role', { p_family: u.family_id }),
  }));
  console.log(u.display_name, r);
}
