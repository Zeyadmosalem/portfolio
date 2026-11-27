/*
 * A made-up family for the Samboza demo. Every name, amount and date is
 * invented and generated relative to today; none of it comes from the real
 * family's records.
 */
export const DEMO_FAMILY_CODE = 'DEMO-2026';

export const DEMO_PEOPLE = [
  { no: 1, name: 'Laila', rel: 'mother', role: 'viewer', email: 'laila@samboza.example', label: 'Viewer' },
  { no: 2, name: 'Karim', rel: 'brother', role: 'admin', email: 'karim@samboza.example', label: 'Admin', operator: true },
  { no: 3, name: 'Omar', rel: 'son', role: 'member', email: 'omar@samboza.example', label: 'Member', model: 'flat' },
  { no: 4, name: 'Nada', rel: 'daughter', role: 'member', email: 'nada@samboza.example', label: 'Member, pots' },
  { no: 5, name: 'Sami', rel: 'uncle_maternal', role: 'driver', email: 'sami@samboza.example', label: 'Driver' },
  { no: 6, name: 'Aunt Hoda', rel: 'aunt_maternal' },
  { no: 7, name: 'Grandma', rel: 'grandmother' },
  { no: 8, name: 'Aunt Salma', rel: 'aunt_paternal' },
  { no: 9, name: 'Yassin & Malek', rel: 'cousins' },
];

const ACCOUNTS = [
  ['cash', 'asset', 'Cash'], ['due_from_driver', 'asset', 'Due from driver'],
  ['remittance_income', 'income', 'Remittances'], ['car_income', 'income', 'Car income'],
  ['car_share_payable', 'liability', 'Car share owed'], ['loan_liability', 'liability', 'Loans owed'],
  ['loan_receivable', 'asset', 'Loans owed to us'], ['opening_balance', 'equity', 'Opening balance'],
];
const CATEGORIES = [
  { en: 'Allowance', ar: 'المصروف', kind: 'expense', colour: '#2a78d6', purpose: 'allowance' },
  { en: 'Rent', ar: 'الإيجار', kind: 'expense', colour: '#eb6834' },
  { en: 'Food', ar: 'الأكل', kind: 'expense', colour: '#1baf7a' },
  { en: 'Education', ar: 'التعليم', kind: 'expense', colour: '#eda100' },
  { en: 'Medical', ar: 'العلاج', kind: 'expense', colour: '#e87ba4' },
  { en: 'Gifts', ar: 'الهدايا', kind: 'expense', colour: '#008300', needs_recipient: true },
  { en: 'Other', ar: 'أخرى', kind: 'expense', colour: '#4a3aa7' },
  { en: 'Other income', ar: 'دخل آخر', kind: 'income', colour: '#6f5bd4' },
];

const EGP = (pounds) => Math.round(pounds * 100);         // amounts are stored in piastres
const day = (ago) => {
  const d = new Date(Date.now() - ago * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// A small deterministic generator, so every visitor gets the same story.
let s = 20260901;
const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const between = (a, b) => Math.round(a + rand() * (b - a));

export async function seed({ superuser: db, rpcAs, insertAs }) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const warn = (what, e) => console.warn(`[demo seed] ${what}: ${e?.message ?? e}`);
  const tryRpc = async (who, fn, args, what = fn) => {
    try { return await rpcAs(who, fn, args); } catch (e) { warn(what, e); return null; }
  };

  const [family] = await q(`insert into families (code, name, base_currency) values ($1, 'The Demo Family', 'EGP') returning *`, [DEMO_FAMILY_CODE]);
  const person = {}; const user = {};
  for (const p of DEMO_PEOPLE) {
    let authId = null;
    if (p.email) {
      [{ id: authId }] = await q(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, last_sign_in_at)
        values (gen_random_uuid(), $1, $2::jsonb, now(), now() - interval '1 day') returning id`, [p.email, JSON.stringify({ display_name: p.name })]);
    }
    const [row] = await q(`insert into people (family_id, member_no, display_name, relationship, is_user, auth_user_id, role, joined_at)
      values ($1, $2, $3, $4, $5, $6, $7::person_role, current_date - 200) returning *`,
    [family.id, p.no, p.name, p.rel, Boolean(p.email), authId, p.role ?? null]);
    person[p.name] = row.id;
    if (authId) user[p.name] = authId;
  }
  try { await q(`update people set must_set_password = false where family_id = $1`, [family.id]); } catch (e) { warn('passwords', e); }
  try { await q(`update people set is_operator = true where id = $1`, [person.Karim]); } catch (e) { warn('operator', e); }

  for (const [key, kind, name] of ACCOUNTS) {
    await q(`insert into accounts (family_id, system_key, kind, name) values ($1, $2, $3, $4)`, [family.id, key, kind, name]);
  }
  const category = {};
  for (const c of CATEGORIES) {
    const key = `cat:${c.en.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const [acct] = await q(`insert into accounts (family_id, system_key, kind, name) values ($1, $2, $3, $4) returning id`, [family.id, key, c.kind, c.en]);
    const [cat] = await q(`insert into categories (family_id, name_en, name_ar, kind, account_id, colour, needs_recipient, is_default, purpose)
      values ($1, $2, $3, $4, $5, $6, $7, true, $8) returning id`, [family.id, c.en, c.ar, c.kind, acct.id, c.colour, Boolean(c.needs_recipient), c.purpose ?? null]);
    category[c.en] = cat.id;
  }
  await q(`update families set car_share_person = $2, car_owner_person = $3, car_value_egp = $4, car_share_paid_egp = $5 where id = $1`,
    [family.id, person['Aunt Salma'], person.Laila, EGP(420000), EGP(110000)]);
  try {
    await q(`update member_books set model = 'flat' where person_id = $1`, [person.Omar]);
    await q(`update member_books set started_on = current_date - 90 where family_id = $1`, [family.id]);
  } catch (e) { warn('book model', e); }

  const F = family.id;
  const admin = user.Karim; const driver = user.Sami;

  // Remittances from Laila, who earns abroad: one a month, at the rate Karim agreed.
  for (const [ago, sar, rate] of [[88, 6000, 12.85], [58, 5500, 12.9], [27, 6500, 12.95]]) {
    await tryRpc(admin, 'record_remittance', { p_family: F, p_from_person: person.Laila, p_amount_original: EGP(sar),
      p_currency: 'SAR', p_fx_rate: rate, p_received_on: day(ago), p_visit_note: null }, 'remittance');
  }

  // Monthly and weekly spending.
  for (const ago of [86, 56, 25]) {
    await tryRpc(admin, 'record_transaction', { p_family: F, p_kind: 'expense', p_category: category.Rent, p_amount: EGP(7500), p_occurred_on: day(ago), p_memo: 'Flat rent' }, 'rent');
    await tryRpc(admin, 'record_transaction', { p_family: F, p_kind: 'expense', p_category: category.Education, p_amount: EGP(between(1800, 3200)), p_occurred_on: day(ago - 3), p_memo: 'Tutoring' }, 'education');
  }
  for (let ago = 84; ago >= 1; ago -= 7) {
    await tryRpc(admin, 'record_transaction', { p_family: F, p_kind: 'expense', p_category: category.Food, p_amount: EGP(between(1100, 1900)), p_occurred_on: day(ago), p_memo: 'Weekly groceries' }, 'food');
    for (const [name, amount] of [['Omar', 600], ['Nada', 450]]) {
      await tryRpc(admin, 'pay_allowance', { p_family: F, p_recipient: person[name], p_amount: EGP(amount), p_paid_on: day(ago - 1) }, 'allowance');
    }
  }
  await tryRpc(admin, 'record_transaction', { p_family: F, p_kind: 'expense', p_category: category.Medical, p_amount: EGP(650), p_occurred_on: day(40), p_memo: 'Clinic visit' }, 'medical');
  await tryRpc(admin, 'record_transaction', { p_family: F, p_kind: 'expense', p_category: category.Gifts, p_amount: EGP(1000), p_occurred_on: day(33), p_person: person.Grandma, p_memo: 'Birthday' }, 'gift');
  await tryRpc(admin, 'record_transaction', { p_family: F, p_kind: 'income', p_category: category['Other income'], p_amount: EGP(2500), p_occurred_on: day(20), p_memo: 'Sold the old fridge' }, 'other income');
  await tryRpc(admin, 'record_transaction', { p_family: F, p_kind: 'expense', p_category: category.Other, p_amount: EGP(380), p_occurred_on: day(9), p_memo: 'Internet bill' }, 'other');

  // A loan the family took and one it gave.
  const loan = await tryRpc(admin, 'record_loan', { p_family: F, p_direction: 'borrowed', p_counterparty: 'Uncle Fathi', p_principal: EGP(20000), p_taken_on: day(70), p_description: 'Car repair' }, 'loan');
  if (loan) {
    await tryRpc(admin, 'record_loan_payment', { p_loan: loan, p_amount: EGP(5000), p_paid_on: day(40) }, 'loan payment');
    await tryRpc(admin, 'record_loan_payment', { p_loan: loan, p_amount: EGP(5000), p_paid_on: day(10) }, 'loan payment');
  }
  await tryRpc(admin, 'record_loan', { p_family: F, p_direction: 'lent', p_counterparty: 'Neighbour Adel', p_principal: EGP(3000), p_taken_on: day(15), p_description: null }, 'loan lent');

  // Sami drives the family car three or four days a week and submits each day.
  const days = [];
  for (let ago = 60; ago >= 1; ago -= 1) {
    if (rand() < 0.5) continue;
    const revenue = between(1300, 2600); const fuel = between(250, 520);
    const indirect = rand() < 0.15 ? between(100, 400) : 0;
    const id = await tryRpc(driver, 'record_car_day', { p_family: F, p_drive_date: day(ago), p_revenue: EGP(revenue), p_fuel: EGP(fuel),
      p_indirect: EGP(indirect), p_indirect_label: indirect ? 'Car wash' : null, p_note: null }, 'car day');
    if (id) days.push([ago, id]);
  }
  for (const [ago, id] of days) {
    if (ago <= 3) continue;                                     // the last few wait for Karim
    if (ago === days[Math.floor(days.length / 2)]?.[0]) {
      await tryRpc(admin, 'decide_car_day', { p_day: id, p_status: 'rejected', p_reason: 'Revenue does not match the app screenshot' }, 'reject day');
    } else {
      await tryRpc(admin, 'decide_car_day', { p_day: id, p_status: 'approved' }, 'approve day');
    }
  }
  await tryRpc(admin, 'record_car_cost', { p_family: F, p_date: day(30), p_amount: EGP(1800), p_label: 'Oil change and filters' }, 'car cost');
  await tryRpc(admin, 'record_car_payout', { p_family: F, p_person: person['Aunt Salma'], p_amount: EGP(3000), p_paid_on: day(12) }, 'car payout');

  // The two members' private books.
  const omarSpends = [['food', 120], ['transport', 60], ['phone', 100], ['going_out', 250], ['study', 180], ['saved', 300], ['clothes', 400]];
  for (let i = 0; i < 18; i += 1) {
    const [cat, amount] = omarSpends[i % omarSpends.length];
    try {
      await insertAs(user.Omar, 'member_payments', { family_id: F, person_id: person.Omar, category: cat,
        amount_egp: EGP(amount + between(-20, 40)), paid_on: day(80 - i * 4), note: null });
    } catch (e) { warn('omar spend', e); break; }
  }
  try {
    await insertAs(user.Omar, 'member_debts', { family_id: F, person_id: person.Omar, owed_to: 'Youssef', amount_egp: EGP(200), borrowed_on: day(14), note: 'Cinema tickets', direction: 'i_owe' });
  } catch (e) { warn('omar debt', e); }
  for (let i = 0; i < 12; i += 1) {
    try {
      await insertAs(user.Nada, 'member_splits', { family_id: F, person_id: person.Nada,
        essentials_egp: EGP(200), investment_egp: EGP(100), emergencies_egp: EGP(50), fun_egp: EGP(100) });
    } catch (e) { warn('nada split', e); break; }
  }
  const pots = ['essentials', 'fun', 'essentials', 'investment', 'fun', 'emergencies'];
  for (let i = 0; i < 12; i += 1) {
    try {
      await insertAs(user.Nada, 'member_payments', { family_id: F, person_id: person.Nada, pot: pots[i % pots.length],
        amount_egp: EGP(between(40, 220)), paid_on: day(78 - i * 6), note: null });
    } catch (e) { warn('nada spend', e); break; }
  }
}
