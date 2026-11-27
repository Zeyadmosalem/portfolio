/*
 * In-browser stand-in for @supabase/supabase-js, used only by the portfolio demo.
 *
 * The real app talks to Supabase (Postgres + RLS + Edge Functions). For a public
 * demo with no backend and no credentials, this module keeps a small database in
 * the visitor's localStorage, answers the PostgREST-style queries the app makes,
 * mirrors the triggers and views the app relies on, and runs the app's REAL Edge
 * Function source (supabase/functions/*) against it. Nothing leaves the browser.
 */
import { seedDatabase } from './seed.js';

const STORE_KEY = 'nc-spark-demo-db-v1';
const SESSION_KEY = 'nc-spark-demo-session-v1';

/* ------------------------------------------------------------------ store -- */

let DB = load();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* blocked storage: fall through to a fresh seed */ }
  return seedDatabase();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch { /* memory only */ }
}
export function resetDemo() {
  try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
const table = (name) => (DB[name] ??= []);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

/* --------------------------------------------------------------- defaults -- */

const DEFAULTS = {
  courses: () => ({ status: 'draft', trainer_id: null, created_at: nowIso(), updated_at: nowIso() }),
  modules: () => ({ unlock_after_module_id: null }),
  activities: () => ({ xp: 10, content: {} }),
  course_materials: () => ({ created_at: nowIso(), size_bytes: null, external_url: null, storage_path: null }),
  enrollments: () => ({ status: 'pending', created_at: nowIso(), decided_at: null, completed_at: null }),
  activity_completions: () => ({ payload: {}, completed_at: nowIso() }),
  teaching_requests: () => ({ status: 'pending', created_at: nowIso() }),
  quizzes: () => ({ pass_mark: 0.7, time_limit_seconds: null, activity_id: null }),
  quiz_questions: () => ({ options: [], points: 1 }),
  quiz_attempts: () => ({ attempt_no: 1, status: 'in_progress', started_at: nowIso(), submitted_at: null,
    graded_at: null, graded_by: null, auto_score: null, final_score: null, passed: null }),
  quiz_answers: () => ({ awarded: null, is_correct: null, comment: null }),
  quiz_retake_grants: () => ({ consumed_at: null, created_at: nowIso() }),
  support_requests: () => ({ status: 'open', course_id: null, created_at: nowIso(), updated_at: nowIso() }),
  support_messages: () => ({ created_at: nowIso() }),
  messages: () => ({ created_at: nowIso() }),
  xp_events: () => ({ created_at: nowIso(), source_id: null }),
  audit_log: () => ({ created_at: nowIso() }),
  user_activity: () => ({ day: today(), hits: 0 }),
  trainee_badges: () => ({ earned_at: nowIso() }),
};
const NO_ID = new Set(['trainee_stats', 'trainee_badges', 'supervisor_trainers', 'badges', 'user_activity',
  'support_reads', 'allowed_domains']);

function withDefaults(name, row) {
  const base = DEFAULTS[name] ? DEFAULTS[name]() : {};
  const out = { ...base, ...row };
  if (!NO_ID.has(name) && !out.id) out.id = uuid();
  if (!('created_at' in out) && !NO_ID.has(name)) out.created_at = nowIso();
  return out;
}

/* Unique keys that inserts / upserts must respect. */
const UNIQUE = {
  enrollments: [['trainee_id', 'course_id']],
  activity_completions: [['enrollment_id', 'activity_id']],
  trainee_stats: [['profile_id']],
  trainee_badges: [['trainee_id', 'badge_code']],
  user_activity: [['user_id', 'day']],
  quiz_attempts: [['quiz_id', 'trainee_id', 'attempt_no']],
};
function conflicts(name, row, cols) {
  const keys = cols ? [cols] : (UNIQUE[name] ?? []);
  const rows = table(name);
  if (!NO_ID.has(name) && row.id && rows.some((r) => r.id === row.id)) return rows.find((r) => r.id === row.id);
  for (const k of keys) {
    const hit = rows.find((r) => k.every((c) => r[c] === row[c]));
    if (hit) return hit;
  }
  if (name === 'xp_events') {
    return rows.find((r) => r.trainee_id === row.trainee_id && r.kind === row.kind && (
      (row.kind === 'participation' && r.course_id === row.course_id && r.created_at.slice(0, 10) === row.created_at.slice(0, 10))
      || (row.kind !== 'participation' && row.source_id && r.source_id === row.source_id)));
  }
  return null;
}

/* ------------------------------------------------------- triggers (mirror) -- */

function insertRaw(name, row) {
  const r = withDefaults(name, row);
  if (conflicts(name, r)) return null;
  table(name).push(r);
  afterInsert(name, r);
  return r;
}

function awardXp(trainee, course, kind, source, pts) {
  if (!trainee || !pts || pts <= 0) return;
  insertRaw('xp_events', { trainee_id: trainee, course_id: course, kind, source_id: source, points: pts });
}

function evaluateBadges(trainee) {
  if (!trainee) return;
  const stats = table('trainee_stats').find((s) => s.profile_id === trainee) ?? { xp: 0, streak: 0 };
  const xp = table('xp_events').filter((x) => x.trainee_id === trainee);
  const earned = [];
  if (xp.some((x) => x.kind === 'activity')) earned.push('first_steps');
  if (xp.some((x) => x.kind === 'participation')) earned.push('contributor');
  if (stats.xp >= 100) earned.push('century');
  if (stats.xp >= 500) earned.push('five_hundred');
  if (stats.streak >= 7) earned.push('week_streak');
  if (table('quiz_attempts').some((a) => a.trainee_id === trainee && a.passed === true
    && Number(a.final_score ?? a.auto_score ?? 0) >= 100)) earned.push('quiz_ace');
  if (table('enrollments').some((e) => e.trainee_id === trainee && e.status === 'completed')) earned.push('finisher');
  for (const code of earned) insertRaw('trainee_badges', { trainee_id: trainee, badge_code: code });
}

function afterInsert(name, row) {
  if (name === 'xp_events') {
    const stats = table('trainee_stats').find((s) => s.profile_id === row.trainee_id);
    const t = today();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (!stats) table('trainee_stats').push({ profile_id: row.trainee_id, xp: row.points, streak: 1, last_active_on: t });
    else {
      stats.xp += row.points;
      stats.streak = stats.last_active_on === t ? stats.streak : stats.last_active_on === yesterday ? stats.streak + 1 : 1;
      stats.last_active_on = t;
    }
    evaluateBadges(row.trainee_id);
  } else if (name === 'activity_completions') {
    const e = table('enrollments').find((x) => x.id === row.enrollment_id);
    const a = table('activities').find((x) => x.id === row.activity_id);
    if (e && a) awardXp(e.trainee_id, e.course_id, 'activity', a.id, a.xp);
  } else if (name === 'messages') {
    const p = table('profiles').find((x) => x.id === row.user_id);
    if (p?.role === 'trainee') awardXp(p.id, row.course_id, 'participation', null, 2);
    emitRealtime('messages', 'INSERT', row);
  }
}

function afterUpdate(name, oldRow, row) {
  if (name === 'quiz_attempts') {
    if (row.passed === true && !oldRow.passed) {
      const q = table('quizzes').find((x) => x.id === row.quiz_id);
      const act = q?.activity_id ? table('activities').find((a) => a.id === q.activity_id) : null;
      const xp = act?.xp ?? 20;
      const score = Number(row.final_score ?? row.auto_score ?? 0);
      awardXp(row.trainee_id, q?.course_id, 'quiz', row.quiz_id, Math.max(1, Math.round((xp * score) / 100)));
    }
  } else if (name === 'enrollments') {
    if (row.status === 'completed' && oldRow.status !== 'completed') evaluateBadges(row.trainee_id);
  } else if (name === 'support_requests' || name === 'courses') {
    row.updated_at = nowIso();
  }
}

/* ------------------------------------------------------------------ views -- */

const profileOf = (id) => table('profiles').find((p) => p.id === id);
const courseIdOfModule = (mid) => table('modules').find((m) => m.id === mid)?.course_id;

const VIEWS = {
  public_profiles: () => table('profiles').map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, role: p.role })),
  enrollment_progress: () => table('enrollments').map((e) => {
    const modules = new Set(table('modules').filter((m) => m.course_id === e.course_id).map((m) => m.id));
    const total = table('activities').filter((a) => modules.has(a.module_id)).length;
    const done = table('activity_completions').filter((c) => c.enrollment_id === e.id).length;
    return { enrollment_id: e.id, trainee_id: e.trainee_id, course_id: e.course_id,
      total_activities: total, completed_activities: done, percent: total ? Math.round((100 * done) / total) : 0 };
  }),
  course_leaderboard: () => {
    const out = [];
    const byCourse = new Map();
    for (const e of table('enrollments')) {
      const p = profileOf(e.trainee_id);
      if (!p) continue;
      const xp = table('xp_events').filter((x) => x.trainee_id === p.id && x.course_id === e.course_id)
        .reduce((s, x) => s + x.points, 0);
      if (!byCourse.has(e.course_id)) byCourse.set(e.course_id, []);
      byCourse.get(e.course_id).push({ course_id: e.course_id, trainee_id: p.id, name: p.name, avatar: p.avatar, xp });
    }
    for (const rows of byCourse.values()) {
      rows.sort((a, b) => b.xp - a.xp);
      rows.forEach((r) => { r.position = 1 + rows.filter((o) => o.xp > r.xp).length; out.push(r); });
    }
    return out;
  },
  support_inbox: () => table('support_requests').map((r) => {
    const msgs = table('support_messages').filter((m) => m.request_id === r.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = msgs[msgs.length - 1];
    const staffReplied = msgs.some((m) => m.author_id !== r.author_id);
    return { request_id: r.id, message_count: msgs.length, last_message_at: last?.created_at ?? r.created_at,
      has_reply: staffReplied, awaiting_staff: !last || last.author_id === r.author_id, unread_count: 0 };
  }),
  user_activity_summary: () => table('profiles').map((p) => {
    const days = table('user_activity').filter((a) => a.user_id === p.id);
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const recent = days.filter((d) => d.day >= since);
    const last = days.map((d) => d.last_seen_at ?? `${d.day}T12:00:00Z`).sort().pop() ?? null;
    return { user_id: p.id, name: p.name, email: p.email, role: p.role, status: p.status, created_at: p.created_at,
      last_seen_at: last, days_active_30: recent.length, visits_30: recent.reduce((s, d) => s + d.hits, 0),
      visits_total: days.reduce((s, d) => s + d.hits, 0) };
  }),
};
VIEWS.support_request_state = VIEWS.support_inbox;

/* ----------------------------------------------------- row-level security -- */

function teaches(user, courseId) {
  return table('courses').some((c) => c.id === courseId && c.trainer_id === user.id);
}
function supervisesCourse(user, courseId) {
  const trainers = new Set(table('supervisor_trainers').filter((s) => s.supervisor_id === user.id).map((s) => s.trainer_id));
  return table('courses').some((c) => c.id === courseId && trainers.has(c.trainer_id));
}
function staffOf(user, courseId) {
  return user.role === 'admin' || teaches(user, courseId) || supervisesCourse(user, courseId);
}
function courseOfRow(name, r) {
  if ('course_id' in r) return r.course_id;
  if (r.enrollment_id) return table('enrollments').find((e) => e.id === r.enrollment_id)?.course_id;
  if (r.quiz_id) return table('quizzes').find((q) => q.id === r.quiz_id)?.course_id;
  if (r.module_id) return courseIdOfModule(r.module_id);
  return null;
}

/* Returns true when `user` may read `r` from `name`. A coarse mirror of the real policies. */
function canRead(name, r, user) {
  if (!user) return false;
  if (name === 'quiz_answer_keys') return false;                  // service role only
  if (user.role === 'admin') return true;
  switch (name) {
    case 'profiles':
      return r.id === user.id || user.role !== 'trainee';
    case 'courses':
      return r.status === 'published' || r.trainer_id === user.id || supervisesCourse(user, r.id);
    case 'enrollments': case 'enrollment_progress': case 'quiz_attempts': case 'quiz_retake_grants':
    case 'trainee_badges': case 'xp_events': {
      const owner = r.trainee_id;
      return owner === user.id || staffOf(user, courseOfRow(name, r))
        || (name === 'trainee_badges' && user.role !== 'trainee');
    }
    case 'activity_completions': {
      const e = table('enrollments').find((x) => x.id === r.enrollment_id);
      return e?.trainee_id === user.id || staffOf(user, e?.course_id);
    }
    case 'trainee_stats':
      return r.profile_id === user.id || user.role !== 'trainee';
    case 'support_requests': case 'support_inbox': case 'support_request_state':
      return (r.author_id ?? table('support_requests').find((s) => s.id === r.request_id)?.author_id) === user.id;
    case 'audit_log': case 'user_activity_summary': case 'allowed_domains':
      return false;
    case 'user_activity':
      return r.user_id === user.id;
    case 'supervisor_trainers':
      return r.supervisor_id === user.id;
    case 'teaching_requests':
      return r.trainer_id === user.id;
    default:
      return true;
  }
}

/* ---------------------------------------------------------- select parser -- */

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
function parseSelect(s) {
  return splitTop((s ?? '*').replace(/\s+/g, ' ')).map((item) => {
    const m = item.match(/^([\w]+)(?::([\w]+))?(?:!([\w]+))?\s*\((.*)\)$/s);
    if (m) {
      const [, a, b, hint, inner] = m;
      const alias = b ? a : null; const rel = b ?? a;
      return { embed: true, rel, alias: alias ?? rel, hint, inner: hint === 'inner', fields: parseSelect(inner) };
    }
    return { embed: false, col: item };
  });
}

const singular = (t) => (t.endsWith('ies') ? `${t.slice(0, -3)}y` : t.endsWith('zes') ? t.slice(0, -3) : t.replace(/s$/, ''));
const FK_COL = { quiz_questions: 'question_id', public_profiles: 'user_id' };
const BACK_COL = { quiz_attempts: 'attempt_id', support_requests: 'request_id' };

function rowsOf(name) {
  return VIEWS[name] ? VIEWS[name]() : table(name);
}

function resolveEmbed(parentName, parent, spec) {
  const rel = spec.rel;
  let col = null;
  if (spec.hint && spec.hint !== 'inner') {
    col = spec.hint.replace(new RegExp(`^${parentName}_`), '').replace(/_fkey$/, '');
  } else if (`${singular(rel)}_id` in parent) col = `${singular(rel)}_id`;
  else if (FK_COL[rel] && FK_COL[rel] in parent) col = FK_COL[rel];
  if (col) {
    const hit = rowsOf(rel).find((r) => (r.id ?? r.code) === parent[col]);
    return { many: false, rows: hit ? [hit] : [] };
  }
  const back = BACK_COL[parentName] ?? `${singular(parentName)}_id`;
  return { many: true, rows: rowsOf(rel).filter((r) => r[back] === parent.id) };
}

function project(name, row, fields) {
  const out = {};
  for (const f of fields) {
    if (f.embed) {
      const { many, rows } = resolveEmbed(name, row, f);
      const shaped = rows.map((r) => project(f.rel, r, f.fields));
      out[f.alias] = many ? shaped : (shaped[0] ?? null);
    } else if (f.col === '*') Object.assign(out, clone(row));
    else out[f.col] = clone(row[f.col]);
  }
  return out;
}

/* ---------------------------------------------------------------- filters -- */

function getPath(row, path) {
  return path.split('.').reduce((v, k) => (Array.isArray(v) ? v.map((x) => x?.[k]) : v?.[k]), row);
}
function cmp(op, a, b) {
  if (Array.isArray(a)) return a.some((x) => cmp(op, x, b));
  switch (op) {
    case 'eq': return a === b || (a != null && b != null && String(a) === String(b));
    case 'neq': return !cmp('eq', a, b);
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'in': return (b ?? []).some((x) => cmp('eq', a, x));
    case 'is': return b === null ? a == null : a === b;
    case 'like': case 'ilike': {
      const re = new RegExp(`^${String(b).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, op === 'ilike' ? 'i' : '');
      return re.test(String(a ?? ''));
    }
    default: return true;
  }
}
function parseFilterValue(op, v) {
  if (op === 'is' && (v === 'null' || v === null)) return null;
  if (op === 'in' && typeof v === 'string') return v.replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
  return v;
}

/* ----------------------------------------------------------- query builder -- */

class Query {
  constructor(client, name) {
    this.client = client; this.name = name; this.op = 'select'; this.filters = []; this.orders = [];
    this.fields = parseSelect('*'); this.wantRows = true; this.singleMode = null; this.lim = null; this.head = false;
    this.countMode = null; this.returning = false;
  }
  select(cols = '*', opts = {}) {
    this.fields = parseSelect(cols);
    if (this.op !== 'select') this.returning = true;
    if (opts.head) this.head = true;
    if (opts.count) this.countMode = opts.count;
    return this;
  }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = rows; this.upsertOpts = opts; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  _f(col, op, val) { this.filters.push({ col, op, val: parseFilterValue(op, val) }); return this; }
  eq(c, v) { return this._f(c, 'eq', v); }
  neq(c, v) { return this._f(c, 'neq', v); }
  gt(c, v) { return this._f(c, 'gt', v); }
  gte(c, v) { return this._f(c, 'gte', v); }
  lt(c, v) { return this._f(c, 'lt', v); }
  lte(c, v) { return this._f(c, 'lte', v); }
  in(c, v) { return this._f(c, 'in', v); }
  is(c, v) { return this._f(c, 'is', v); }
  like(c, v) { return this._f(c, 'like', v); }
  ilike(c, v) { return this._f(c, 'ilike', v); }
  match(obj) { Object.entries(obj).forEach(([c, v]) => this.eq(c, v)); return this; }
  filter(c, op, v) { return this._f(c, op, v); }
  not(c, op, v) { this.filters.push({ col: c, op, val: parseFilterValue(op, v), negate: true }); return this; }
  or() { return this; }
  order(col, opts = {}) { this.orders.push({ col, asc: opts.ascending !== false, nullsFirst: opts.nullsFirst }); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.offset = a; this.lim = b - a + 1; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'one'; return this; }
  abortSignal() { return this; }
  returns() { return this; }
  throwOnError() { return this; }
  then(res, rej) { return Promise.resolve().then(() => this._run()).then(res, rej); }
  catch(rej) { return this.then(undefined, rej); }

  _matches(row, user) {
    if (!this.client.service && !canRead(this.name, row, user)) return false;
    for (const f of this.filters) {
      if (f.col.includes('.')) continue;
      const ok = cmp(f.op, row[f.col], f.val);
      if (f.negate ? ok : !ok) return false;
    }
    return true;
  }
  _embedFiltersPass(projected) {
    for (const f of this.filters) {
      if (!f.col.includes('.')) continue;
      const [rel] = f.col.split('.');
      const v = getPath(projected, f.col);
      const vals = Array.isArray(v) ? v : [v];
      const ok = vals.some((x) => cmp(f.op, x, f.val));
      if (projected[rel] == null) return false;
      if (f.negate ? ok : !ok) return false;
    }
    for (const spec of this.fields) {
      if (spec.embed && spec.inner) {
        const v = projected[spec.alias];
        if (v == null || (Array.isArray(v) && v.length === 0)) return false;
      }
    }
    return true;
  }
  _shape(rows) {
    // Embedded filters must see embedded columns even when the select omits them.
    const fields = [...this.fields];
    return rows.map((r) => project(this.name, r, fields)).filter((p) => this._embedFiltersPass(p));
  }
  _finish(rows, count) {
    if (this.head) return { data: null, error: null, count: count ?? rows.length, status: 200 };
    if (this.singleMode) {
      if (rows.length === 0) {
        return this.singleMode === 'maybe' ? { data: null, error: null }
          : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      }
      if (rows.length > 1 && this.singleMode === 'one') {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      }
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null, count: this.countMode ? (count ?? rows.length) : null };
  }

  async _run() {
    const user = await this.client._user();
    if (!this.client.service && !user) return { data: null, error: { message: 'JWT expired or missing' } };
    if (!this.client.service && this.name === 'quiz_answer_keys') {
      return { data: null, error: { message: 'permission denied for table quiz_answer_keys', code: '42501' } };
    }
    try {
      if (this.op === 'select') return this._select(user);
      if (this.op === 'insert' || this.op === 'upsert') return this._insert(user);
      if (this.op === 'update') return this._update(user);
      if (this.op === 'delete') return this._delete(user);
    } finally {
      save();
    }
    return { data: null, error: null };
  }

  _select(user) {
    let rows = rowsOf(this.name).filter((r) => this._matches(r, user));
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = a[o.col]; const y = b[o.col];
        if (x == null && y == null) return 0;
        if (x == null) return o.nullsFirst ? -1 : 1;
        if (y == null) return o.nullsFirst ? 1 : -1;
        const c = x < y ? -1 : x > y ? 1 : 0;
        return o.asc ? c : -c;
      });
    }
    let shaped = this._shape(rows);
    const count = shaped.length;
    if (this.offset) shaped = shaped.slice(this.offset);
    if (this.lim != null) shaped = shaped.slice(0, this.lim);
    return this._finish(shaped, count);
  }

  _guardWrite(user) {
    if (this.client.service) return null;
    if (user?.status !== 'active') return { message: 'Account is not active' };
    return null;
  }

  _insert(user) {
    const denied = this._guardWrite(user);
    if (denied) return { data: null, error: denied };
    const list = Array.isArray(this.payload) ? this.payload : [this.payload];
    const out = [];
    for (const raw of list) {
      const row = withDefaults(this.name, raw);
      const onConflict = this.upsertOpts?.onConflict?.split(',').map((s) => s.trim());
      const hit = conflicts(this.name, row, onConflict);
      if (hit) {
        if (this.op === 'upsert' && !this.upsertOpts?.ignoreDuplicates) {
          const before = { ...hit }; Object.assign(hit, raw); afterUpdate(this.name, before, hit); out.push(hit);
        } else if (this.op === 'insert') {
          return { data: null, error: { message: `duplicate key value violates unique constraint on ${this.name}`, code: '23505' } };
        }
        continue;
      }
      table(this.name).push(row);
      afterInsert(this.name, row);
      out.push(row);
    }
    if (!this.returning) return { data: null, error: null };
    return this._finish(this._shape(out));
  }

  _update(user) {
    const denied = this._guardWrite(user);
    if (denied) return { data: null, error: denied };
    const rows = table(this.name).filter((r) => this._matches(r, user) || this.client.service);
    const touched = rows.filter((r) => this.filters.every((f) => {
      const ok = cmp(f.op, r[f.col], f.val); return f.negate ? !ok : ok;
    }));
    if (!this.client.service && this.name === 'profiles') {
      const bad = Object.keys(this.payload).some((k) => ['role', 'status', 'email'].includes(k));
      if (bad) return { data: null, error: { message: 'Only an administrator can change role or status' } };
    }
    for (const r of touched) {
      const before = { ...r };
      Object.assign(r, this.payload);
      afterUpdate(this.name, before, r);
    }
    if (!this.returning) return { data: null, error: null };
    return this._finish(this._shape(touched));
  }

  _delete(user) {
    const denied = this._guardWrite(user);
    if (denied) return { data: null, error: denied };
    const all = table(this.name);
    const gone = all.filter((r) => (this.client.service || this._matches(r, user))
      && this.filters.every((f) => { const ok = cmp(f.op, r[f.col], f.val); return f.negate ? !ok : ok; }));
    DB[this.name] = all.filter((r) => !gone.includes(r));
    // ON DELETE CASCADE for the few relations the app deletes through.
    if (this.name === 'courses') for (const c of gone) cascadeCourse(c.id);
    if (this.name === 'modules') for (const m of gone) DB.activities = table('activities').filter((a) => a.module_id !== m.id);
    return this.returning ? this._finish(this._shape(gone)) : { data: null, error: null };
  }
}

function cascadeCourse(courseId) {
  const mods = new Set(table('modules').filter((m) => m.course_id === courseId).map((m) => m.id));
  DB.modules = table('modules').filter((m) => m.course_id !== courseId);
  DB.activities = table('activities').filter((a) => !mods.has(a.module_id));
  DB.enrollments = table('enrollments').filter((e) => e.course_id !== courseId);
  DB.course_materials = table('course_materials').filter((m) => m.course_id !== courseId);
}

/* -------------------------------------------------------------------- RPC -- */

function isModuleUnlocked(enrollment, module) {
  const m = table('modules').find((x) => x.id === module);
  if (!m) return null;
  if (!m.unlock_after_module_id) return true;
  return table('activities').filter((a) => a.module_id === m.unlock_after_module_id)
    .every((a) => table('activity_completions').some((c) => c.enrollment_id === enrollment && c.activity_id === a.id));
}
const RPC = {
  is_module_unlocked_for: ({ enrollment, module }) => isModuleUnlocked(enrollment, module),
  all_modules_complete_for: ({ enrollment }) => {
    const e = table('enrollments').find((x) => x.id === enrollment);
    if (!e) return false;
    const mods = new Set(table('modules').filter((m) => m.course_id === e.course_id).map((m) => m.id));
    return table('activities').filter((a) => mods.has(a.module_id))
      .every((a) => table('activity_completions').some((c) => c.enrollment_id === e.id && c.activity_id === a.id));
  },
  has_unconsumed_retake_for: ({ quiz, trainee }) => table('quiz_retake_grants')
    .some((g) => g.quiz_id === quiz && g.trainee_id === trainee && g.consumed_at == null),
  touch_activity: (_args, user) => {
    if (!user) return null;
    const row = table('user_activity').find((a) => a.user_id === user.id && a.day === today());
    if (row) { row.hits += 1; row.last_seen_at = nowIso(); } else {
      table('user_activity').push({ user_id: user.id, day: today(), hits: 1, last_seen_at: nowIso() });
    }
    return null;
  },
};

/* --------------------------------------------------------------- realtime -- */

const channels = new Set();
function emitRealtime(tableName, event, row) {
  for (const ch of channels) {
    for (const l of ch.listeners) {
      if (l.table !== tableName) continue;
      if (l.event !== '*' && l.event !== event) continue;
      if (l.filter) {
        const m = l.filter.match(/^(\w+)=eq\.(.+)$/);
        if (m && String(row[m[1]]) !== m[2]) continue;
      }
      setTimeout(() => l.cb({ eventType: event, new: clone(row), old: {}, table: tableName }), 0);
    }
  }
}
function makeChannel(name) {
  const ch = {
    name, listeners: [],
    on(_type, opts, cb) { ch.listeners.push({ table: opts.table, event: opts.event ?? '*', filter: opts.filter, cb }); return ch; },
    subscribe(cb) { channels.add(ch); cb?.('SUBSCRIBED'); return ch; },
    unsubscribe() { channels.delete(ch); return Promise.resolve('ok'); },
  };
  return ch;
}

/* ---------------------------------------------------------------- storage -- */

const blobs = new Map();
const DEMO_FILE = 'data:text/plain;charset=utf-8,' + encodeURIComponent(
  'NC Spark demo file.\n\nIn the real app this is a private file served by a short-lived signed URL.');
function storageBucket(bucket) {
  return {
    async upload(path, file) {
      if (file && file.size > 5 * 1024 * 1024) return { data: null, error: { message: 'Files over 5 MB are not accepted in the demo.' } };
      try { blobs.set(`${bucket}/${path}`, URL.createObjectURL(file)); } catch { /* ignore */ }
      return { data: { path }, error: null };
    },
    async createSignedUrl(path) {
      return { data: { signedUrl: blobs.get(`${bucket}/${path}`) ?? DEMO_FILE }, error: null };
    },
    async remove() { return { data: [], error: null }; },
    getPublicUrl(path) { return { data: { publicUrl: blobs.get(`${bucket}/${path}`) ?? DEMO_FILE } }; },
  };
}

/* ------------------------------------------------------------------- auth -- */

const authListeners = new Set();
function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return memorySession; }
}
let memorySession = null;
function writeSession(s) {
  memorySession = s;
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
function sessionFor(p) {
  return { access_token: `demo.${p.id}`, token_type: 'bearer', expires_in: 3600,
    user: { id: p.id, email: p.email, user_metadata: { name: p.name }, role: 'authenticated' } };
}
function notify(event, session) {
  for (const cb of authListeners) setTimeout(() => cb(event, session), 0);
}
export async function demoSignInAs(email) {
  const p = table('profiles').find((x) => x.email === email);
  if (!p) return;
  const s = sessionFor(p);
  writeSession(s);
  notify('SIGNED_IN', s);
}

function makeAuth(service) {
  return {
    async getSession() { return { data: { session: readSession() }, error: null }; },
    async getUser(token) {
      const id = token ? String(token).replace(/^demo\./, '') : readSession()?.user?.id;
      const p = id && profileOf(id);
      return p ? { data: { user: sessionFor(p).user }, error: null } : { data: { user: null }, error: { message: 'invalid token' } };
    },
    onAuthStateChange(cb) {
      authListeners.add(cb);
      setTimeout(() => cb('INITIAL_SESSION', readSession()), 0);
      return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
    },
    async signInWithPassword({ email }) {
      const p = table('profiles').find((x) => x.email === String(email).toLowerCase());
      if (!p) return { data: null, error: { message: 'Invalid login credentials. Use one of the demo accounts below.' } };
      const s = sessionFor(p);
      writeSession(s);
      notify('SIGNED_IN', s);
      return { data: { session: s, user: s.user }, error: null };
    },
    async signUp() {
      return { data: null, error: { message: 'Sign-up is closed in this demo. Use one of the demo accounts.' } };
    },
    async signOut() { writeSession(null); notify('SIGNED_OUT', null); return { error: null }; },
    async updateUser() { return { data: {}, error: null }; },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
    admin: service ? {} : undefined,
  };
}

/* ---------------------------------------------------------- edge functions -- */

const ENV = {
  SUPABASE_URL: 'https://demo.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-demo',
  ALLOWED_ORIGINS: typeof location !== 'undefined' ? location.origin : '',
  // A throwaway key made fresh in each visitor's browser, so the support
  // inbox's envelope encryption runs for real. It protects nothing secret.
  SUPPORT_MASTER_KEY: demoMasterKey(),
};
function demoMasterKey() {
  const k = 'nc-spark-demo-master-key';
  try {
    const have = localStorage.getItem(k);
    if (have) return have;
  } catch { /* ignore */ }
  const made = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  try { localStorage.setItem(k, made); } catch { /* ignore */ }
  return made;
}
let pendingHandler = null;
globalThis.Deno = {
  env: { get: (k) => ENV[k] },
  serve: (h) => { pendingHandler = h; },
};
const FUNCTION_SOURCES = import.meta.glob('/supabase/functions/*/index.ts');
const handlers = new Map();
async function handlerFor(name) {
  if (handlers.has(name)) return handlers.get(name);
  const load = FUNCTION_SOURCES[`/supabase/functions/${name}/index.ts`];
  if (!load) return null;
  pendingHandler = null;
  await load();
  handlers.set(name, pendingHandler);
  return pendingHandler;
}

/* ----------------------------------------------------------------- client -- */

class Client {
  constructor(service) {
    this.service = service;
    this.auth = makeAuth(service);
    this.storage = { from: storageBucket };
    this.functions = { invoke: (name, opts) => this._invoke(name, opts) };
  }
  async _user() {
    if (this.service) return null;
    const id = readSession()?.user?.id;
    return id ? profileOf(id) : null;
  }
  from(name) { return new Query(this, name); }
  async rpc(name, args = {}) {
    const fn = RPC[name];
    if (!fn) return { data: null, error: { message: `function ${name} does not exist` } };
    const data = fn(args, await this._user());
    save();
    return { data, error: null };
  }
  channel(name) { return makeChannel(name); }
  removeChannel(ch) { channels.delete(ch); return Promise.resolve('ok'); }
  async _invoke(name, { body } = {}) {
    const handler = await handlerFor(name);
    if (!handler) return { data: null, error: { message: `Function ${name} is not available in the demo` } };
    const session = readSession();
    const req = new Request(`https://demo.invalid/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ENV.ALLOWED_ORIGINS,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });
    const res = await handler(req);
    save();
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) {
      const context = new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
      return { data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context } };
    }
    return { data, error: null };
  }
}

export function createClient(_url, key) {
  return new Client(key === ENV.SUPABASE_SERVICE_ROLE_KEY);
}
export const demoProfiles = () => table('profiles');
export { readSession as demoSession };
