const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./demo-bar-DF1AtTn8.js","./backend-CkDcUYfu.js","./rolldown-runtime-CbXtAM7H.js","./chunk-VBDAOXYI-8bEITGqV.js","./preload-helper-uBIymjUX.js","./main-DD4kFHEQ.js","./main-Hok4reoD.css"])))=>i.map(i=>d[i]);
import{t as e}from"./preload-helper-uBIymjUX.js";import{i as t}from"./backend-CkDcUYfu.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var n=`
create extension if not exists pgcrypto;
create table families (
  id            uuid primary key default gen_random_uuid(),
  code          text        not null unique,   
  name          text        not null,
  base_currency char(3)     not null default 'EGP',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  constraint families_code_shape check (code ~ '^[A-Z]{4}-[0-9]{4}$')
);
create table family_invites (
  id         uuid        primary key default gen_random_uuid(),
  family_id  uuid        not null references families on delete cascade,
  code       text        not null unique,
  created_by uuid        not null,
  expires_at timestamptz not null,
  max_uses   int         not null default 1 check (max_uses > 0),
  used_count int         not null default 0 check (used_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (used_count <= max_uses)
);
create index on family_invites (family_id);
create type person_role as enum ('admin','member','viewer','driver');
create table people (
  id           uuid        primary key default gen_random_uuid(),
  family_id    uuid        not null references families on delete cascade,
  member_no    int         not null check (member_no > 0),
  display_name text        not null,
  relationship text        not null check (relationship in (
                 'mother','father','brother','sister','son','daughter',
                 'aunt_maternal','aunt_paternal','uncle_maternal','uncle_paternal',
                 'grandmother','grandfather','cousins','external')),
  is_user      boolean     not null default false,
  auth_user_id uuid        unique references auth.users on delete set null,
  role         person_role,
  active       boolean     not null default true,
  joined_at    date        not null default current_date,
  created_at   timestamptz not null default now(),
  unique (family_id, member_no),
  constraint people_user_has_role   check (not is_user or role is not null),
  constraint people_role_needs_user check (is_user or role is null)
);
create index on people (family_id);
create index on people (auth_user_id) where auth_user_id is not null;
create or replace function my_person(p_family uuid)
returns people
language sql stable security definer set search_path = public as $$
  select * from people
   where auth_user_id = auth.uid()
     and family_id    = p_family
     and active
   limit 1
$$;
create or replace function my_role(p_family uuid)
returns person_role
language sql stable security definer set search_path = public as $$
  select role from people
   where auth_user_id = auth.uid()
     and family_id    = p_family
     and active
   limit 1
$$;
`,r=`
create type account_kind as enum ('asset','liability','income','expense','equity');
create table accounts (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families on delete cascade,
  kind       account_kind not null,
  name       text not null,
  person_id  uuid references people,
  system_key text,          
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (family_id, system_key)
);
create index on accounts (family_id);
create table categories (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references families on delete cascade,
  name_en         text not null,
  name_ar         text not null,
  kind            text not null check (kind in ('income','expense')),
  account_id      uuid not null references accounts,
  colour          text,
  icon            text,
  is_default      boolean not null default false,
  needs_recipient boolean not null default false,   
  active          boolean not null default true,
  unique (family_id, name_en)
);
create index on categories (family_id);
create table journals (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families on delete cascade,
  occurred_on  date not null,                  
  recorded_at  timestamptz not null default now(),   
  recorded_by  uuid not null references people,
  memo         text,
  source_table text,
  source_id    uuid,
  reverses     uuid references journals,       
  client_uuid  uuid unique                     
);
create index on journals (family_id, occurred_on);
create table entries (
  id          uuid   primary key default gen_random_uuid(),
  journal_id  uuid   not null references journals on delete cascade,
  account_id  uuid   not null references accounts,
  amount      bigint not null check (amount <> 0),   
  person_id   uuid   references people,              
  category_id uuid   references categories
);
create index on entries (account_id);
create index on entries (journal_id);
create index on entries (person_id) where person_id is not null;
create or replace function assert_journal_balanced() returns trigger
language plpgsql as $$
declare
  j uuid := coalesce(new.journal_id, old.journal_id);
  total bigint;
begin
  select coalesce(sum(amount), 0) into total from entries where journal_id = j;
  if total <> 0 then
    raise exception 'journal % does not balance: sums to %', j, total
      using errcode = 'check_violation';
  end if;
  return null;
end $$;
create constraint trigger entries_must_balance
  after insert or update or delete on entries
  deferrable initially deferred
  for each row execute function assert_journal_balanced();
revoke update, delete on journals from authenticated, anon;
revoke update, delete on entries  from authenticated, anon;
create view account_balances as
  select a.family_id,
         a.id  as account_id,
         a.system_key,
         a.kind,
         coalesce(sum(e.amount), 0) as balance
    from accounts a
    left join entries e on e.account_id = a.id
   group by a.family_id, a.id, a.system_key, a.kind;
create table period_closes (
  id        uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  closes_on date not null,
  closed_by uuid not null references people,
  closed_at timestamptz not null default now(),
  balances  jsonb not null,
  unique (family_id, closes_on)
);
create or replace function post_journal(
  p_family       uuid,
  p_occurred_on  date,
  p_memo         text,
  p_lines        jsonb,          
  p_source_table text default null,
  p_source_id    uuid default null,
  p_client_uuid  uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me      people;
  v_journal uuid;
  v_line    jsonb;
  v_total   bigint := 0;
begin
  v_me := my_person(p_family);
  if v_me.id is null then
    raise exception 'not a member of this family' using errcode = 'insufficient_privilege';
  end if;
  if v_me.role <> 'admin' then
    raise exception 'only the family admin posts to the ledger'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_journal from journals where client_uuid = p_client_uuid;
    if v_journal is not null then return v_journal; end if;
  end if;
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'a journal needs at least two lines';
  end if;
  insert into journals (family_id, occurred_on, recorded_by, memo,
                        source_table, source_id, client_uuid)
       values (p_family, p_occurred_on, v_me.id, p_memo,
               p_source_table, p_source_id, p_client_uuid)
    returning id into v_journal;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into entries (journal_id, account_id, amount, person_id, category_id)
    values (
      v_journal,
      (v_line->>'account_id')::uuid,
      (v_line->>'amount')::bigint,
      nullif(v_line->>'person_id','')::uuid,
      nullif(v_line->>'category_id','')::uuid
    );
    v_total := v_total + (v_line->>'amount')::bigint;
  end loop;
  if v_total <> 0 then
    raise exception 'journal does not balance: lines sum to %', v_total
      using errcode = 'check_violation';
  end if;
  return v_journal;
end $$;
create or replace function reverse_journal(p_journal uuid, p_memo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src     journals;
  v_me      people;
  v_journal uuid;
begin
  select * into v_src from journals where id = p_journal;
  if v_src.id is null then raise exception 'no such journal'; end if;
  v_me := my_person(v_src.family_id);
  if v_me.role <> 'admin' then
    raise exception 'only the family admin reverses a journal'
      using errcode = 'insufficient_privilege';
  end if;
  insert into journals (family_id, occurred_on, recorded_by, memo, reverses)
       values (v_src.family_id, current_date, v_me.id,
               coalesce(p_memo, 'reversal'), p_journal)
    returning id into v_journal;
  insert into entries (journal_id, account_id, amount, person_id, category_id)
  select v_journal, account_id, -amount, person_id, category_id
    from entries where journal_id = p_journal;
  return v_journal;
end $$;
`,ee=`
create table remittances (
  id              uuid   primary key default gen_random_uuid(),
  family_id       uuid   not null references families on delete cascade,
  from_person     uuid   not null references people,
  amount_original bigint not null check (amount_original > 0),
  currency        char(3) not null,
  fx_rate         numeric(12,6) not null check (fx_rate > 0),
  amount_egp      bigint not null check (amount_egp > 0),
  received_on     date   not null,
  rate_set_by     uuid   not null references people,   
  visit_note      text,
  journal_id      uuid   references journals,
  client_uuid     uuid   unique,
  created_at      timestamptz not null default now()
);
create index on remittances (family_id, received_on);
create table allowance_rates (
  id             uuid   primary key default gen_random_uuid(),
  family_id      uuid   not null references families on delete cascade,
  recipient_id   uuid   not null references people,
  amount_egp     bigint not null check (amount_egp >= 0),
  effective_from date   not null,
  set_by         uuid   not null references people,
  created_at     timestamptz not null default now(),
  unique (recipient_id, effective_from)
);
create or replace function allowance_rate_on(p_recipient uuid, p_when date)
returns bigint
language sql stable as $$
  select amount_egp from allowance_rates
   where recipient_id = p_recipient
     and effective_from <= p_when
   order by effective_from desc
   limit 1
$$;
create table allowances (
  id           uuid   primary key default gen_random_uuid(),
  family_id    uuid   not null references families on delete cascade,
  recipient_id uuid   not null references people,
  period       date   not null,             
  amount_egp   bigint not null check (amount_egp > 0),
  paid_on      date   not null,
  paid_by      uuid   not null references people,
  journal_id   uuid   not null references journals,
  client_uuid  uuid   unique,
  unique (recipient_id, period),
  constraint allowances_period_is_month_start check (extract(day from period) = 1)
);
create type submission_status as enum ('pending','approved','rejected');
create table member_expenses (
  id          uuid   primary key default gen_random_uuid(),
  family_id   uuid   not null references families on delete cascade,
  person_id   uuid   not null references people,
  category_id uuid   not null references categories,
  amount_egp  bigint not null check (amount_egp > 0),
  occurred_on date   not null,
  description text,
  status      submission_status not null default 'pending',
  decided_by  uuid   references people,
  decided_at  timestamptz,
  reason      text,
  client_uuid uuid   unique,
  created_at  timestamptz not null default now(),
  constraint me_not_future check (occurred_on <= current_date),
  constraint me_decided_has_decider
    check (status = 'pending' or (decided_by is not null and decided_at is not null)),
  constraint me_pending_has_no_decider
    check (status <> 'pending' or (decided_by is null and decided_at is null))
);
create index on member_expenses (person_id, occurred_on);
create index on member_expenses (family_id, status);
create or replace function decide_member_expense(
  p_id uuid, p_status submission_status, p_reason text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row member_expenses;
  v_me  people;
begin
  select * into v_row from member_expenses where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.role <> 'admin' then
    raise exception 'only the family admin decides submissions'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status = 'pending' then
    raise exception 'cannot move a submission back to pending';
  end if;
  update member_expenses
     set status = p_status, decided_by = v_me.id, decided_at = now(), reason = p_reason
   where id = p_id and status = 'pending';
  return found;
end $$;
`,te=`
create table car_handovers (
  id           uuid   primary key default gen_random_uuid(),
  family_id    uuid   not null references families on delete cascade,
  received_on  date   not null,
  amount_egp   bigint not null,            
  counted_egp  bigint not null,            
  confirmed_by uuid   not null references people,
  journal_id   uuid   not null references journals,
  note         text,
  client_uuid  uuid   unique,
  created_at   timestamptz not null default now(),
  constraint handover_not_future check (received_on <= current_date)
);
create type car_day_status as enum ('recorded','settled','off');
create table car_days (
  id           uuid   primary key default gen_random_uuid(),
  family_id    uuid   not null references families on delete cascade,
  drive_date   date   not null,
  worked       boolean not null default true,
  gross_egp    bigint not null default 0 check (gross_egp >= 0),
  direct_egp   bigint not null default 0 check (direct_egp >= 0),
  indirect_egp bigint not null default 0 check (indirect_egp >= 0),
  net_egp      bigint not null default 0,       
  driver_egp   bigint not null default 0,
  family_egp   bigint not null default 0,
  marwa_egp    bigint not null default 0,
  status       car_day_status not null default 'recorded',
  submitted_by uuid   not null references people,
  handover_id  uuid   references car_handovers,
  client_uuid  uuid   unique,
  created_at   timestamptz not null default now(),
  unique (family_id, drive_date),
  constraint cd_not_future check (drive_date <= current_date),
  constraint cd_off_has_no_money check (worked or (gross_egp = 0 and net_egp = 0)),
  constraint cd_off_status       check (worked or status = 'off'),
  constraint cd_worked_status    check (not worked or status in ('recorded','settled')),
  constraint cd_split_is_exact check (driver_egp + family_egp + marwa_egp = net_egp),
  constraint cd_net_is_derived  check (net_egp = gross_egp - direct_egp - indirect_egp),
  constraint cd_settled_has_handover
    check ((status = 'settled') = (handover_id is not null))
);
create index on car_days (family_id, drive_date desc);
create index on car_days (status) where status = 'recorded';
create table car_expenses (
  id          uuid   primary key default gen_random_uuid(),
  car_day_id  uuid   not null references car_days on delete cascade,
  label       text   not null check (label in
                ('fuel','tolls','permit','admin','ticket','other')),
  class       text   not null check (class in ('direct','indirect')),
  amount_egp  bigint not null check (amount_egp > 0),
  description text
);
create index on car_expenses (car_day_id);
create or replace function car_split(p_net bigint)
returns table (driver_egp bigint, family_egp bigint, marwa_egp bigint)
language sql immutable as $$
  select d, f, (p_net - d) - f
    from (select round(p_net / 3.0)::bigint as d) s,
         lateral (select round((p_net - s.d) * 0.75)::bigint as f) t
$$;
create or replace function confirm_handover(
  p_family      uuid,
  p_day_ids     uuid[],
  p_received_on date,
  p_counted_egp bigint,
  p_cash_account uuid,
  p_due_account  uuid,
  p_note        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_amount   bigint;
  v_journal  uuid;
  v_handover uuid;
  v_count    int;
begin
  v_me := my_person(p_family);
  if v_me.role <> 'admin' then
    raise exception 'only the family admin confirms a handover'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_handover from car_handovers where client_uuid = p_client_uuid;
    if v_handover is not null then return v_handover; end if;
  end if;
  select coalesce(sum(family_egp), 0), count(*)
    into v_amount, v_count
    from car_days
   where family_id = p_family
     and id = any (p_day_ids)
     and status = 'recorded';          
  if v_count = 0 then
    raise exception 'no unsettled days in that selection';
  end if;
  v_journal := post_journal(
    p_family, p_received_on, coalesce(p_note, 'car handover'),
    jsonb_build_array(
      jsonb_build_object('account_id', p_cash_account, 'amount',  p_counted_egp),
      jsonb_build_object('account_id', p_due_account,  'amount', -p_counted_egp)
    ),
    'car_handovers', null, p_client_uuid
  );
  insert into car_handovers (family_id, received_on, amount_egp, counted_egp,
                             confirmed_by, journal_id, note, client_uuid)
       values (p_family, p_received_on, v_amount, p_counted_egp,
               v_me.id, v_journal, p_note, p_client_uuid)
    returning id into v_handover;
  update car_days
     set status = 'settled', handover_id = v_handover
   where family_id = p_family and id = any (p_day_ids) and status = 'recorded';
  return v_handover;
end $$;
`,i=`
create table loans (
  id            uuid   primary key default gen_random_uuid(),
  family_id     uuid   not null references families on delete cascade,
  direction     text   not null check (direction in ('borrowed','lent')),
  counterparty  text   not null,
  principal_egp bigint not null check (principal_egp > 0),
  taken_on      date   not null,
  description   text,
  journal_id    uuid   not null references journals,
  client_uuid   uuid   unique
);
create table loan_payments (
  id         uuid   primary key default gen_random_uuid(),
  loan_id    uuid   not null references loans on delete cascade,
  amount_egp bigint not null check (amount_egp > 0),
  paid_on    date   not null,
  journal_id uuid   not null references journals,
  client_uuid uuid  unique
);
create index on loan_payments (loan_id);
create view loan_balances as
  select l.id as loan_id,
         l.family_id,
         l.counterparty,
         l.principal_egp,
         coalesce(sum(p.amount_egp), 0)                    as repaid_egp,
         l.principal_egp - coalesce(sum(p.amount_egp), 0)  as remaining_egp,
         case
           when coalesce(sum(p.amount_egp), 0) >= l.principal_egp then 'repaid'
           when coalesce(sum(p.amount_egp), 0) > 0               then 'partial'
           else 'outstanding'
         end as status
    from loans l
    left join loan_payments p on p.loan_id = l.id
   group by l.id;
create table personal_entries (
  id          uuid   primary key default gen_random_uuid(),
  family_id   uuid   not null references families on delete cascade,
  person_id   uuid   not null references people,
  direction   text   not null check (direction in ('in','out')),
  category    text   not null,          
  amount      bigint not null check (amount > 0),
  currency    char(3) not null,         
  occurred_on date   not null,
  description text,
  family_ref  uuid   references remittances,  
  client_uuid uuid   unique,
  created_at  timestamptz not null default now(),
  constraint pe_not_future check (occurred_on <= current_date)
);
create index on personal_entries (person_id, occurred_on desc);
`,a=`
alter table families         enable row level security;
alter table family_invites   enable row level security;
alter table people           enable row level security;
alter table accounts         enable row level security;
alter table categories       enable row level security;
alter table journals         enable row level security;
alter table entries          enable row level security;
alter table period_closes    enable row level security;
alter table remittances      enable row level security;
alter table allowance_rates  enable row level security;
alter table allowances       enable row level security;
alter table member_expenses  enable row level security;
alter table car_handovers    enable row level security;
alter table car_days         enable row level security;
alter table car_expenses     enable row level security;
alter table loans            enable row level security;
alter table loan_payments    enable row level security;
alter table personal_entries enable row level security;
create policy families_read on families for select
  using (my_role(id) is not null);
create policy people_read on people for select
  using (my_role(family_id) is not null);
create policy people_write on people for all
  using      (my_role(family_id) = 'admin')
  with check (my_role(family_id) = 'admin');
create policy invites_admin on family_invites for all
  using      (my_role(family_id) = 'admin')
  with check (my_role(family_id) = 'admin');
create policy accounts_read on accounts for select
  using (my_role(family_id) in ('admin','viewer'));
create policy categories_read on categories for select
  using (my_role(family_id) is not null);      
create policy categories_write on categories for all
  using      (my_role(family_id) = 'admin')
  with check (my_role(family_id) = 'admin');
create policy journals_read on journals for select
  using (my_role(family_id) in ('admin','viewer'));
create policy entries_read on entries for select
  using (exists (
    select 1 from journals j
     where j.id = entries.journal_id
       and my_role(j.family_id) in ('admin','viewer')
  ));
create policy journals_no_direct_write on journals for insert with check (false);
create policy entries_no_direct_write  on entries  for insert with check (false);
create policy closes_read on period_closes for select
  using (my_role(family_id) in ('admin','viewer'));
create policy closes_write on period_closes for insert
  with check (my_role(family_id) = 'admin');
create policy remittances_read on remittances for select
  using (my_role(family_id) in ('admin','viewer'));
create policy remittances_write on remittances for all
  using      (my_role(family_id) = 'admin')
  with check (my_role(family_id) = 'admin');
create policy rates_read on allowance_rates for select
  using (
    my_role(family_id) in ('admin','viewer')
    or recipient_id = (my_person(family_id)).id     
  );
create policy rates_write on allowance_rates for all
  using      (my_role(family_id) = 'admin')
  with check (my_role(family_id) = 'admin');
create policy allowances_read on allowances for select
  using (
    my_role(family_id) in ('admin','viewer')
    or recipient_id = (my_person(family_id)).id
  );
create policy allowances_write on allowances for all
  using      (my_role(family_id) = 'admin')
  with check (my_role(family_id) = 'admin');
create policy me_read on member_expenses for select
  using (
    person_id = (my_person(family_id)).id           
    or my_role(family_id) in ('admin','viewer')     
  );
create policy me_insert on member_expenses for insert
  with check (
    my_role(family_id) = 'member'
    and person_id = (my_person(family_id)).id
    and status = 'pending'
  );
create policy me_no_direct_update on member_expenses for update using (false);
create policy car_days_read on car_days for select
  using (
    submitted_by = (my_person(family_id)).id
    or my_role(family_id) in ('admin','viewer')
  );
create policy car_days_insert on car_days for insert
  with check (
    my_role(family_id) = 'driver'
    and submitted_by = (my_person(family_id)).id
    and status in ('recorded','off')
    and handover_id is null
  );
create policy car_days_no_direct_update on car_days for update using (false);
create policy car_expenses_read on car_expenses for select
  using (exists (
    select 1 from car_days d
     where d.id = car_expenses.car_day_id
       and (d.submitted_by = (my_person(d.family_id)).id
            or my_role(d.family_id) in ('admin','viewer'))
  ));
create policy car_expenses_insert on car_expenses for insert
  with check (exists (
    select 1 from car_days d
     where d.id = car_expenses.car_day_id
       and d.submitted_by = (my_person(d.family_id)).id
       and d.status <> 'settled'
  ));
create policy handovers_read on car_handovers for select
  using (my_role(family_id) in ('admin','viewer','driver'));
create policy handovers_write on car_handovers for insert
  with check (false);          
create policy loans_read on loans for select
  using (my_role(family_id) in ('admin','viewer'));
create policy loans_write on loans for all
  using      (my_role(family_id) = 'admin')
  with check (my_role(family_id) = 'admin');
create policy loan_payments_read on loan_payments for select
  using (exists (
    select 1 from loans l
     where l.id = loan_payments.loan_id
       and my_role(l.family_id) in ('admin','viewer')
  ));
create policy personal_owner_only on personal_entries for all
  using      (person_id = (my_person(family_id)).id)
  with check (person_id = (my_person(family_id)).id);
`,o=`
create or replace function record_transaction(
  p_family      uuid,
  p_kind        text,      
  p_category    uuid,
  p_amount      bigint,    
  p_occurred_on date,
  p_person      uuid default null,   
  p_memo        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_cash     uuid;
  v_category categories;
  v_lines    jsonb;
begin
  if p_kind not in ('income','expense') then
    raise exception 'kind must be income or expense, got %', p_kind;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be a positive number of piastres';
  end if;
  if p_occurred_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  v_me := my_person(p_family);
  if v_me.role <> 'admin' then
    raise exception 'only the family admin records to the ledger'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_category from categories
   where id = p_category and family_id = p_family and active;
  if v_category.id is null then
    raise exception 'no such category in this family';
  end if;
  if v_category.kind <> p_kind then
    raise exception 'category % is an % category, not %',
      v_category.name_en, v_category.kind, p_kind;
  end if;
  if v_category.needs_recipient and p_person is null then
    raise exception 'category % needs a recipient', v_category.name_en;
  end if;
  select id into v_cash from accounts
   where family_id = p_family and system_key = 'cash';
  if v_cash is null then
    raise exception 'this family has no cash account — run the bootstrap';
  end if;
  if p_kind = 'expense' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_category.account_id, 'amount',  p_amount,
                         'category_id', p_category, 'person_id', p_person),
      jsonb_build_object('account_id', v_cash, 'amount', -p_amount)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_cash, 'amount',  p_amount),
      jsonb_build_object('account_id', v_category.account_id, 'amount', -p_amount,
                         'category_id', p_category, 'person_id', p_person)
    );
  end if;
  return post_journal(p_family, p_occurred_on, p_memo, v_lines,
                      'record_transaction', null, p_client_uuid);
end $$;
create or replace view ledger_feed as
  select
    e.id                as entry_id,
    j.id                as journal_id,
    j.family_id,
    j.occurred_on,
    j.recorded_at,
    j.memo,
    j.reverses,
    c.id                as category_id,
    c.name_en           as category_en,
    c.name_ar           as category_ar,
    c.colour            as category_colour,
    c.kind              as category_kind,
    p.id                as person_id,
    p.display_name      as person_name,
    a.kind              as account_kind,
    case when a.kind = 'expense' then -e.amount
         when a.kind = 'income'  then -e.amount
         else e.amount end as signed_amount,
    abs(e.amount)       as amount
  from entries e
  join journals   j on j.id = e.journal_id
  join accounts   a on a.id = e.account_id
  left join categories c on c.id = e.category_id
  left join people     p on p.id = e.person_id
  where a.system_key is distinct from 'cash';
`,s=`
alter view account_balances set (security_invoker = on);
alter view ledger_feed      set (security_invoker = on);
alter view loan_balances    set (security_invoker = on);
`,c=`
create or replace function post_journal(
  p_family       uuid,
  p_occurred_on  date,
  p_memo         text,
  p_lines        jsonb,          
  p_source_table text default null,
  p_source_id    uuid default null,
  p_client_uuid  uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me      people;
  v_journal uuid;
  v_line    jsonb;
  v_total   bigint := 0;
begin
  v_me := my_person(p_family);
  if v_me.id is null then
    raise exception 'not a member of this family' using errcode = 'insufficient_privilege';
  end if;
  if v_me.role is distinct from 'admin' then
    raise exception 'only the family admin posts to the ledger'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_journal from journals where client_uuid = p_client_uuid;
    if v_journal is not null then return v_journal; end if;
  end if;
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'a journal needs at least two lines';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_lines) l
      left join accounts a on a.id = nullif(l->>'account_id','')::uuid
     where a.id is null or a.family_id <> p_family
  ) then
    raise exception 'every line must post to an account in this family'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_lines) l
      join people p on p.id = nullif(l->>'person_id','')::uuid
     where p.family_id <> p_family
  ) then
    raise exception 'a journal line names a person from another family'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_lines) l
      join categories c on c.id = nullif(l->>'category_id','')::uuid
     where c.family_id <> p_family
  ) then
    raise exception 'a journal line names a category from another family'
      using errcode = 'insufficient_privilege';
  end if;
  insert into journals (family_id, occurred_on, recorded_by, memo,
                        source_table, source_id, client_uuid)
       values (p_family, p_occurred_on, v_me.id, p_memo,
               p_source_table, p_source_id, p_client_uuid)
    returning id into v_journal;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into entries (journal_id, account_id, amount, person_id, category_id)
    values (
      v_journal,
      (v_line->>'account_id')::uuid,
      (v_line->>'amount')::bigint,
      nullif(v_line->>'person_id','')::uuid,
      nullif(v_line->>'category_id','')::uuid
    );
    v_total := v_total + (v_line->>'amount')::bigint;
  end loop;
  if v_total <> 0 then
    raise exception 'journal does not balance: lines sum to %', v_total
      using errcode = 'check_violation';
  end if;
  return v_journal;
end $$;
create or replace function reverse_journal(p_journal uuid, p_memo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src     journals;
  v_me      people;
  v_journal uuid;
begin
  select * into v_src from journals where id = p_journal;
  if v_src.id is null then
    raise exception 'no such journal' using errcode = 'insufficient_privilege';
  end if;
  v_me := my_person(v_src.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin reverses a journal'
      using errcode = 'insufficient_privilege';
  end if;
  insert into journals (family_id, occurred_on, recorded_by, memo, reverses)
       values (v_src.family_id, current_date, v_me.id,
               coalesce(p_memo, 'reversal'), p_journal)
    returning id into v_journal;
  insert into entries (journal_id, account_id, amount, person_id, category_id)
  select v_journal, account_id, -amount, person_id, category_id
    from entries where journal_id = p_journal;
  return v_journal;
end $$;
create or replace function record_transaction(
  p_family      uuid,
  p_kind        text,      
  p_category    uuid,
  p_amount      bigint,    
  p_occurred_on date,
  p_person      uuid default null,   
  p_memo        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_cash     uuid;
  v_category categories;
  v_lines    jsonb;
begin
  if p_kind not in ('income','expense') then
    raise exception 'kind must be income or expense, got %', p_kind;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be a positive number of piastres';
  end if;
  if p_occurred_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin records to the ledger'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_category from categories
   where id = p_category and family_id = p_family and active;
  if v_category.id is null then
    raise exception 'no such category in this family';
  end if;
  if v_category.kind <> p_kind then
    raise exception 'category % is an % category, not %',
      v_category.name_en, v_category.kind, p_kind;
  end if;
  if p_person is not null and not exists (
    select 1 from people where id = p_person and family_id = p_family
  ) then
    raise exception 'that person is not in this family'
      using errcode = 'insufficient_privilege';
  end if;
  if v_category.needs_recipient and p_person is null then
    raise exception 'category % needs a recipient', v_category.name_en;
  end if;
  select id into v_cash from accounts
   where family_id = p_family and system_key = 'cash';
  if v_cash is null then
    raise exception 'this family has no cash account — run the bootstrap';
  end if;
  if p_kind = 'expense' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_category.account_id, 'amount',  p_amount,
                         'category_id', p_category, 'person_id', p_person),
      jsonb_build_object('account_id', v_cash, 'amount', -p_amount)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_cash, 'amount',  p_amount),
      jsonb_build_object('account_id', v_category.account_id, 'amount', -p_amount,
                         'category_id', p_category, 'person_id', p_person)
    );
  end if;
  return post_journal(p_family, p_occurred_on, p_memo, v_lines,
                      'record_transaction', null, p_client_uuid);
end $$;
create or replace function decide_member_expense(
  p_id uuid, p_status submission_status, p_reason text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row member_expenses;
  v_me  people;
begin
  select * into v_row from member_expenses where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin decides submissions'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status = 'pending' then
    raise exception 'cannot move a submission back to pending';
  end if;
  update member_expenses
     set status = p_status, decided_by = v_me.id, decided_at = now(), reason = p_reason
   where id = p_id and status = 'pending';
  return found;
end $$;
drop function if exists confirm_handover(uuid, uuid[], date, bigint, uuid, uuid, text, uuid);
create or replace function confirm_handover(
  p_family      uuid,
  p_day_ids     uuid[],
  p_received_on date,
  p_counted_egp bigint,
  p_note        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_amount   bigint;
  v_journal  uuid;
  v_handover uuid;
  v_count    int;
  v_cash     uuid;
  v_due      uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin confirms a handover'
      using errcode = 'insufficient_privilege';
  end if;
  if p_counted_egp is null or p_counted_egp <= 0 then
    raise exception 'a handover records what was actually counted, in piastres';
  end if;
  if p_received_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if p_client_uuid is not null then
    select id into v_handover from car_handovers where client_uuid = p_client_uuid;
    if v_handover is not null then return v_handover; end if;
  end if;
  select coalesce(sum(family_egp), 0), count(*)
    into v_amount, v_count
    from car_days
   where family_id = p_family
     and id = any (p_day_ids)
     and status = 'recorded';          
  if v_count = 0 then
    raise exception 'no unsettled days in that selection';
  end if;
  select id into v_cash from accounts where family_id = p_family and system_key = 'cash';
  select id into v_due  from accounts where family_id = p_family and system_key = 'due_from_driver';
  if v_cash is null or v_due is null then
    raise exception 'this family has no cash or due_from_driver account — run the bootstrap';
  end if;
  v_journal := post_journal(
    p_family, p_received_on, coalesce(p_note, 'car handover'),
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash, 'amount',  p_counted_egp),
      jsonb_build_object('account_id', v_due,  'amount', -p_counted_egp)
    ),
    'car_handovers', null, p_client_uuid
  );
  insert into car_handovers (family_id, received_on, amount_egp, counted_egp,
                             confirmed_by, journal_id, note, client_uuid)
       values (p_family, p_received_on, v_amount, p_counted_egp,
               v_me.id, v_journal, p_note, p_client_uuid)
    returning id into v_handover;
  update car_days
     set status = 'settled', handover_id = v_handover
   where family_id = p_family and id = any (p_day_ids) and status = 'recorded';
  return v_handover;
end $$;
`,l=`
alter table categories add column if not exists purpose text
  check (purpose is null or purpose in ('allowance'));
create unique index if not exists categories_one_per_purpose
  on categories (family_id, purpose) where purpose is not null;
update categories set purpose = 'allowance'
 where purpose is null and name_en = 'Allowance' and kind = 'expense';
create or replace function assert_person_in_family() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_column text  := tg_argv[0];
  v_person uuid  := (to_jsonb(new) ->> v_column)::uuid;
begin
  if v_person is not null and not exists (
    select 1 from people where id = v_person and family_id = new.family_id
  ) then
    raise exception '%.% must name a person in this family', tg_table_name, v_column
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create or replace trigger rates_recipient_in_family before insert or update on allowance_rates
  for each row execute function assert_person_in_family('recipient_id');
create or replace trigger allowances_recipient_in_family before insert or update on allowances
  for each row execute function assert_person_in_family('recipient_id');
create or replace trigger me_person_in_family before insert or update on member_expenses
  for each row execute function assert_person_in_family('person_id');
create or replace trigger car_days_submitter_in_family before insert or update on car_days
  for each row execute function assert_person_in_family('submitted_by');
create or replace trigger remittances_from_in_family before insert or update on remittances
  for each row execute function assert_person_in_family('from_person');
create or replace function set_allowance_rate(
  p_family         uuid,
  p_recipient      uuid,
  p_amount         bigint,        
  p_effective_from date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me people;
  v_id uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin sets an allowance'
      using errcode = 'insufficient_privilege';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'an allowance cannot be negative';
  end if;
  if not exists (select 1 from people
                  where id = p_recipient and family_id = p_family and active) then
    raise exception 'that person is not in this family'
      using errcode = 'insufficient_privilege';
  end if;
  insert into allowance_rates (family_id, recipient_id, amount_egp, effective_from, set_by)
       values (p_family, p_recipient, p_amount, p_effective_from, v_me.id)
  on conflict (recipient_id, effective_from)
    do update set amount_egp = excluded.amount_egp, set_by = excluded.set_by
  returning id into v_id;
  return v_id;
end $$;
create or replace function pay_allowance(
  p_family      uuid,
  p_recipient   uuid,
  p_period      date,                   
  p_paid_on     date default current_date,
  p_amount      bigint default null,    
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me        people;
  v_cat       categories;
  v_cash      uuid;
  v_amount    bigint;
  v_journal   uuid;
  v_allowance uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin pays an allowance'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_allowance from allowances where client_uuid = p_client_uuid;
    if v_allowance is not null then return v_allowance; end if;
  end if;
  if p_period <> date_trunc('month', p_period)::date then
    raise exception 'a period is the first of its month, got %', p_period;
  end if;
  if p_paid_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if not exists (select 1 from people
                  where id = p_recipient and family_id = p_family and active) then
    raise exception 'that person is not in this family'
      using errcode = 'insufficient_privilege';
  end if;
  v_amount := coalesce(p_amount, allowance_rate_on(p_recipient, p_period));
  if v_amount is null then
    raise exception 'no allowance rate has been set for that person';
  end if;
  if v_amount <= 0 then
    raise exception 'there is nothing to pay for that month';
  end if;
  if exists (select 1 from allowances
              where recipient_id = p_recipient and period = p_period) then
    raise exception 'that month has already been paid';
  end if;
  select * into v_cat from categories
   where family_id = p_family and purpose = 'allowance' and active;
  if v_cat.id is null then
    raise exception 'this family has no Allowance category — run the bootstrap';
  end if;
  select id into v_cash from accounts
   where family_id = p_family and system_key = 'cash';
  if v_cash is null then
    raise exception 'this family has no cash account — run the bootstrap';
  end if;
  v_journal := post_journal(
    p_family, p_paid_on,
    'allowance ' || to_char(p_period, 'Mon YYYY'),
    jsonb_build_array(
      jsonb_build_object('account_id', v_cat.account_id, 'amount', v_amount,
                         'category_id', v_cat.id, 'person_id', p_recipient),
      jsonb_build_object('account_id', v_cash, 'amount', -v_amount)
    ),
    'allowances', null, p_client_uuid
  );
  insert into allowances (family_id, recipient_id, period, amount_egp,
                          paid_on, paid_by, journal_id, client_uuid)
       values (p_family, p_recipient, p_period, v_amount,
               p_paid_on, v_me.id, v_journal, p_client_uuid)
    returning id into v_allowance;
  return v_allowance;
end $$;
create or replace view member_balances as
  with recipients as (
    select family_id, recipient_id as person_id from allowance_rates
    union
    select family_id, recipient_id from allowances
    union
    select family_id, person_id from member_expenses
  ),
  paid as (
    select family_id, recipient_id as person_id,
           sum(amount_egp) as received,
           max(period)     as last_period
      from allowances group by family_id, recipient_id
  ),
  spent as (
    select family_id, person_id,
           coalesce(sum(amount_egp) filter (where status = 'approved'), 0) as approved,
           coalesce(sum(amount_egp) filter (where status = 'pending'),  0) as pending,
           count(*) filter (where status = 'pending')                      as pending_count
      from member_expenses group by family_id, person_id
  )
  select r.family_id,
         r.person_id,
         coalesce(p.received, 0)                            as received,
         coalesce(s.approved, 0)                            as approved,
         coalesce(p.received, 0) - coalesce(s.approved, 0)  as balance,
         coalesce(s.pending, 0)                             as pending,
         coalesce(s.pending_count, 0)                       as pending_count,
         p.last_period,
         allowance_rate_on(r.person_id, current_date)       as rate
    from recipients r
    left join paid  p on p.family_id = r.family_id and p.person_id = r.person_id
    left join spent s on s.family_id = r.family_id and s.person_id = r.person_id;
alter view member_balances set (security_invoker = on);
`,u=`
create or replace function pay_allowance(
  p_family      uuid,
  p_recipient   uuid,
  p_period      date,                   
  p_paid_on     date default current_date,
  p_amount      bigint default null,    
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me        people;
  v_cat       categories;
  v_cash      uuid;
  v_amount    bigint;
  v_journal   uuid;
  v_allowance uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin pays an allowance'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_allowance from allowances where client_uuid = p_client_uuid;
    if v_allowance is not null then return v_allowance; end if;
  end if;
  if p_period <> date_trunc('month', p_period)::date then
    raise exception 'a period is the first of its month, got %', p_period;
  end if;
  if p_paid_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if not exists (select 1 from people
                  where id = p_recipient and family_id = p_family and active) then
    raise exception 'that person is not in this family'
      using errcode = 'insufficient_privilege';
  end if;
  v_amount := coalesce(
    p_amount,
    allowance_rate_on(p_recipient, (p_period + interval '1 month - 1 day')::date)
  );
  if v_amount is null then
    raise exception 'no allowance rate has been set for that person';
  end if;
  if v_amount <= 0 then
    raise exception 'there is nothing to pay for that month';
  end if;
  if exists (select 1 from allowances
              where recipient_id = p_recipient and period = p_period) then
    raise exception 'that month has already been paid';
  end if;
  select * into v_cat from categories
   where family_id = p_family and purpose = 'allowance' and active;
  if v_cat.id is null then
    raise exception 'this family has no Allowance category — run the bootstrap';
  end if;
  select id into v_cash from accounts
   where family_id = p_family and system_key = 'cash';
  if v_cash is null then
    raise exception 'this family has no cash account — run the bootstrap';
  end if;
  v_journal := post_journal(
    p_family, p_paid_on,
    'allowance ' || to_char(p_period, 'Mon YYYY'),
    jsonb_build_array(
      jsonb_build_object('account_id', v_cat.account_id, 'amount', v_amount,
                         'category_id', v_cat.id, 'person_id', p_recipient),
      jsonb_build_object('account_id', v_cash, 'amount', -v_amount)
    ),
    'allowances', null, p_client_uuid
  );
  insert into allowances (family_id, recipient_id, period, amount_egp,
                          paid_on, paid_by, journal_id, client_uuid)
       values (p_family, p_recipient, p_period, v_amount,
               p_paid_on, v_me.id, v_journal, p_client_uuid)
    returning id into v_allowance;
  return v_allowance;
end $$;
`,d=`
alter table car_days add column if not exists journal_id  uuid references journals;
alter table car_days add column if not exists voided_at   timestamptz;
alter table car_days add column if not exists void_reason text;
alter table car_days drop constraint if exists car_days_family_id_drive_date_key;
create unique index if not exists car_days_one_live_per_day
  on car_days (family_id, drive_date) where voided_at is null;
create or replace function post_journal_as(
  p_family       uuid,
  p_recorded_by  uuid,
  p_occurred_on  date,
  p_memo         text,
  p_lines        jsonb,
  p_source_table text default null,
  p_source_id    uuid default null,
  p_client_uuid  uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_journal uuid;
  v_line    jsonb;
  v_total   bigint := 0;
begin
  if p_client_uuid is not null then
    select id into v_journal from journals where client_uuid = p_client_uuid;
    if v_journal is not null then return v_journal; end if;
  end if;
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'a journal needs at least two lines';
  end if;
  if not exists (select 1 from people
                  where id = p_recorded_by and family_id = p_family) then
    raise exception 'the recorder must be a person in this family'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) l
      left join accounts a on a.id = nullif(l->>'account_id','')::uuid
     where a.id is null or a.family_id <> p_family
  ) then
    raise exception 'every line must post to an account in this family'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) l
      join people p on p.id = nullif(l->>'person_id','')::uuid
     where p.family_id <> p_family
  ) then
    raise exception 'a journal line names a person from another family'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) l
      join categories c on c.id = nullif(l->>'category_id','')::uuid
     where c.family_id <> p_family
  ) then
    raise exception 'a journal line names a category from another family'
      using errcode = 'insufficient_privilege';
  end if;
  insert into journals (family_id, occurred_on, recorded_by, memo,
                        source_table, source_id, client_uuid)
       values (p_family, p_occurred_on, p_recorded_by, p_memo,
               p_source_table, p_source_id, p_client_uuid)
    returning id into v_journal;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into entries (journal_id, account_id, amount, person_id, category_id)
    values (v_journal,
            (v_line->>'account_id')::uuid,
            (v_line->>'amount')::bigint,
            nullif(v_line->>'person_id','')::uuid,
            nullif(v_line->>'category_id','')::uuid);
    v_total := v_total + (v_line->>'amount')::bigint;
  end loop;
  if v_total <> 0 then
    raise exception 'journal does not balance: lines sum to %', v_total
      using errcode = 'check_violation';
  end if;
  return v_journal;
end $$;
revoke all on function post_journal_as(uuid, uuid, date, text, jsonb, text, uuid, uuid)
  from public, anon, authenticated;
create or replace function post_journal(
  p_family       uuid,
  p_occurred_on  date,
  p_memo         text,
  p_lines        jsonb,
  p_source_table text default null,
  p_source_id    uuid default null,
  p_client_uuid  uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me people;
begin
  v_me := my_person(p_family);
  if v_me.id is null then
    raise exception 'not a member of this family' using errcode = 'insufficient_privilege';
  end if;
  if v_me.role is distinct from 'admin' then
    raise exception 'only the family admin posts to the ledger'
      using errcode = 'insufficient_privilege';
  end if;
  return post_journal_as(p_family, v_me.id, p_occurred_on, p_memo, p_lines,
                         p_source_table, p_source_id, p_client_uuid);
end $$;
create or replace function record_car_day(
  p_family      uuid,
  p_drive_date  date,
  p_worked      boolean,
  p_gross       bigint  default 0,     
  p_expenses    jsonb   default '[]',  
  p_client_uuid uuid    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_day      uuid;
  v_direct   bigint := 0;
  v_indirect bigint := 0;
  v_net      bigint;
  v_split    record;
  v_line     jsonb;
  v_due      uuid;
  v_income   uuid;
  v_journal  uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'driver' then
    raise exception 'only the driver records a day'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_day from car_days where client_uuid = p_client_uuid;
    if v_day is not null then return v_day; end if;
  end if;
  if p_drive_date > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if p_gross is null or p_gross < 0 then
    raise exception 'takings cannot be negative';
  end if;
  if not p_worked then
    if p_gross <> 0 or jsonb_array_length(p_expenses) > 0 then
      raise exception 'a day off has no takings and no costs';
    end if;
    insert into car_days (family_id, drive_date, worked, status, submitted_by, client_uuid)
         values (p_family, p_drive_date, false, 'off', v_me.id, p_client_uuid)
      returning id into v_day;
    return v_day;
  end if;
  for v_line in select * from jsonb_array_elements(p_expenses) loop
    if (v_line->>'class') not in ('direct','indirect') then
      raise exception 'a cost is direct or indirect, got %', v_line->>'class';
    end if;
    if (v_line->>'amount_egp')::bigint <= 0 then
      raise exception 'a cost must be a positive number of piastres';
    end if;
    if (v_line->>'class') = 'direct'
      then v_direct   := v_direct   + (v_line->>'amount_egp')::bigint;
      else v_indirect := v_indirect + (v_line->>'amount_egp')::bigint;
    end if;
  end loop;
  v_net := p_gross - v_direct - v_indirect;
  select * into v_split from car_split(v_net);
  insert into car_days (family_id, drive_date, worked, gross_egp, direct_egp,
                        indirect_egp, net_egp, driver_egp, family_egp, marwa_egp,
                        status, submitted_by, client_uuid)
       values (p_family, p_drive_date, true, p_gross, v_direct, v_indirect,
               v_net, v_split.driver_egp, v_split.family_egp, v_split.marwa_egp,
               'recorded', v_me.id, p_client_uuid)
    returning id into v_day;
  for v_line in select * from jsonb_array_elements(p_expenses) loop
    insert into car_expenses (car_day_id, label, class, amount_egp, description)
    values (v_day, v_line->>'label', v_line->>'class',
            (v_line->>'amount_egp')::bigint, nullif(v_line->>'description',''));
  end loop;
  if v_split.family_egp <> 0 then
    select id into v_due    from accounts where family_id = p_family and system_key = 'due_from_driver';
    select id into v_income from accounts where family_id = p_family and system_key = 'car_income';
    if v_due is null or v_income is null then
      raise exception 'this family has no due_from_driver or car_income account — run the bootstrap';
    end if;
    v_journal := post_journal_as(
      p_family, v_me.id, p_drive_date,
      'car ' || to_char(p_drive_date, 'DD Mon'),
      jsonb_build_array(
        jsonb_build_object('account_id', v_due,    'amount',  v_split.family_egp,
                           'person_id', v_me.id),
        jsonb_build_object('account_id', v_income, 'amount', -v_split.family_egp)
      ),
      'car_days', v_day, null
    );
    update car_days set journal_id = v_journal where id = v_day;
  end if;
  return v_day;
end $$;
create or replace function void_car_day(p_day uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row car_days;
  v_me  people;
begin
  select * into v_row from car_days where id = p_day;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin voids a day'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then return false; end if;
  if v_row.status = 'settled' then
    raise exception 'that day has already been handed over — reverse the handover first';
  end if;
  if v_row.journal_id is not null then
    perform post_journal_as(
      v_row.family_id, v_me.id, current_date,
      coalesce(p_reason, 'voided car day'),
      (select jsonb_agg(jsonb_build_object(
                'account_id', e.account_id, 'amount', -e.amount,
                'person_id',  e.person_id,  'category_id', e.category_id))
         from entries e where e.journal_id = v_row.journal_id),
      'car_days', p_day, null);
  end if;
  update car_days
     set voided_at = now(), void_reason = p_reason
   where id = p_day;
  return true;
end $$;
create or replace function confirm_handover(
  p_family      uuid,
  p_day_ids     uuid[],
  p_received_on date,
  p_counted_egp bigint,
  p_note        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_amount   bigint;
  v_journal  uuid;
  v_handover uuid;
  v_count    int;
  v_cash     uuid;
  v_due      uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin confirms a handover'
      using errcode = 'insufficient_privilege';
  end if;
  if p_counted_egp is null or p_counted_egp <= 0 then
    raise exception 'a handover records what was actually counted, in piastres';
  end if;
  if p_received_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if p_client_uuid is not null then
    select id into v_handover from car_handovers where client_uuid = p_client_uuid;
    if v_handover is not null then return v_handover; end if;
  end if;
  select coalesce(sum(family_egp), 0), count(*)
    into v_amount, v_count
    from car_days
   where family_id = p_family
     and id = any (p_day_ids)
     and status = 'recorded'
     and voided_at is null;          
  if v_count = 0 then
    raise exception 'no unsettled days in that selection';
  end if;
  select id into v_cash from accounts where family_id = p_family and system_key = 'cash';
  select id into v_due  from accounts where family_id = p_family and system_key = 'due_from_driver';
  if v_cash is null or v_due is null then
    raise exception 'this family has no cash or due_from_driver account — run the bootstrap';
  end if;
  v_journal := post_journal(
    p_family, p_received_on, coalesce(p_note, 'car handover'),
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash, 'amount',  p_counted_egp),
      jsonb_build_object('account_id', v_due,  'amount', -p_counted_egp)
    ),
    'car_handovers', null, p_client_uuid
  );
  insert into car_handovers (family_id, received_on, amount_egp, counted_egp,
                             confirmed_by, journal_id, note, client_uuid)
       values (p_family, p_received_on, v_amount, p_counted_egp,
               v_me.id, v_journal, p_note, p_client_uuid)
    returning id into v_handover;
  update car_days
     set status = 'settled', handover_id = v_handover
   where family_id = p_family and id = any (p_day_ids)
     and status = 'recorded' and voided_at is null;
  return v_handover;
end $$;
drop policy if exists car_days_insert on car_days;
create policy car_days_no_direct_insert on car_days for insert with check (false);
drop policy if exists car_expenses_insert on car_expenses;
create policy car_expenses_no_direct_insert on car_expenses for insert with check (false);
`,f=`
alter table families add column if not exists car_share_person uuid references people;
insert into accounts (family_id, kind, name, system_key)
select f.id, 'liability', 'Car share owed', 'car_share_payable'
  from families f
 where not exists (
   select 1 from accounts a
    where a.family_id = f.id and a.system_key = 'car_share_payable');
update families f
   set car_share_person = p.id
  from people p
 where p.family_id = f.id
   and p.display_name = 'Salma'
   and f.car_share_person is null;
alter table car_days add column if not exists loss_journal_id uuid references journals;
alter table car_days drop constraint if exists cd_split_is_exact;
alter table car_days add constraint cd_split_is_exact
  check (driver_egp + family_egp + marwa_egp = greatest(net_egp, 0));
alter table car_days drop constraint if exists cd_shares_not_negative;
alter table car_days add constraint cd_shares_not_negative
  check (driver_egp >= 0 and family_egp >= 0 and marwa_egp >= 0);
create or replace function record_car_day(
  p_family      uuid,
  p_drive_date  date,
  p_worked      boolean,
  p_gross       bigint  default 0,
  p_expenses    jsonb   default '[]',
  p_client_uuid uuid    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_day      uuid;
  v_direct   bigint := 0;
  v_indirect bigint := 0;
  v_net      bigint;
  v_driver   bigint := 0;
  v_family   bigint := 0;
  v_marwa    bigint := 0;
  v_split    record;
  v_line     jsonb;
  v_due      uuid;
  v_income   uuid;
  v_payable  uuid;
  v_sharer   uuid;
  v_journal  uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'driver' then
    raise exception 'only the driver records a day'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_day from car_days where client_uuid = p_client_uuid;
    if v_day is not null then return v_day; end if;
  end if;
  if p_drive_date > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if p_gross is null or p_gross < 0 then
    raise exception 'takings cannot be negative';
  end if;
  if not p_worked then
    if p_gross <> 0 or jsonb_array_length(p_expenses) > 0 then
      raise exception 'a day off has no takings and no costs';
    end if;
    insert into car_days (family_id, drive_date, worked, status, submitted_by, client_uuid)
         values (p_family, p_drive_date, false, 'off', v_me.id, p_client_uuid)
      returning id into v_day;
    return v_day;
  end if;
  for v_line in select * from jsonb_array_elements(p_expenses) loop
    if (v_line->>'class') not in ('direct','indirect') then
      raise exception 'a cost is direct or indirect, got %', v_line->>'class';
    end if;
    if (v_line->>'amount_egp')::bigint <= 0 then
      raise exception 'a cost must be a positive number of piastres';
    end if;
    if (v_line->>'class') = 'direct'
      then v_direct   := v_direct   + (v_line->>'amount_egp')::bigint;
      else v_indirect := v_indirect + (v_line->>'amount_egp')::bigint;
    end if;
  end loop;
  v_net := p_gross - v_direct - v_indirect;
  if v_net > 0 then
    select * into v_split from car_split(v_net);
    v_driver := v_split.driver_egp;
    v_family := v_split.family_egp;
    v_marwa  := v_split.marwa_egp;
  end if;
  insert into car_days (family_id, drive_date, worked, gross_egp, direct_egp,
                        indirect_egp, net_egp, driver_egp, family_egp, marwa_egp,
                        status, submitted_by, client_uuid)
       values (p_family, p_drive_date, true, p_gross, v_direct, v_indirect,
               v_net, v_driver, v_family, v_marwa,
               'recorded', v_me.id, p_client_uuid)
    returning id into v_day;
  for v_line in select * from jsonb_array_elements(p_expenses) loop
    insert into car_expenses (car_day_id, label, class, amount_egp, description)
    values (v_day, v_line->>'label', v_line->>'class',
            (v_line->>'amount_egp')::bigint, nullif(v_line->>'description',''));
  end loop;
  if v_family + v_marwa > 0 then
    select id into v_due     from accounts where family_id = p_family and system_key = 'due_from_driver';
    select id into v_income  from accounts where family_id = p_family and system_key = 'car_income';
    select id into v_payable from accounts where family_id = p_family and system_key = 'car_share_payable';
    select car_share_person into v_sharer from families where id = p_family;
    if v_due is null or v_income is null or v_payable is null then
      raise exception 'this family is missing a car account — run the bootstrap';
    end if;
    v_journal := post_journal_as(
      p_family, v_me.id, p_drive_date,
      'car ' || to_char(p_drive_date, 'DD Mon'),
      jsonb_build_array(
        jsonb_build_object('account_id', v_due,     'amount',  v_family + v_marwa,
                           'person_id', v_me.id),
        jsonb_build_object('account_id', v_income,  'amount', -v_family),
        jsonb_build_object('account_id', v_payable, 'amount', -v_marwa,
                           'person_id', v_sharer)
      ),
      'car_days', v_day, null
    );
    update car_days set journal_id = v_journal where id = v_day;
  end if;
  return v_day;
end $$;
create or replace function settle_car_loss(
  p_day         uuid,
  p_category    uuid,
  p_memo        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_row     car_days;
  v_me      people;
  v_cat     categories;
  v_cash    uuid;
  v_amount  bigint;
  v_journal uuid;
begin
  select * into v_row from car_days where id = p_day;
  if v_row.id is null then raise exception 'no such day'; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin settles a losing day'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then raise exception 'that day was voided'; end if;
  if v_row.net_egp >= 0 then raise exception 'that day did not lose money'; end if;
  if v_row.loss_journal_id is not null then
    raise exception 'that day has already been settled';
  end if;
  v_amount := -v_row.net_egp;
  select * into v_cat from categories
   where id = p_category and family_id = v_row.family_id and active and kind = 'expense';
  if v_cat.id is null then
    raise exception 'that is not an expense category in this family';
  end if;
  select id into v_cash from accounts
   where family_id = v_row.family_id and system_key = 'cash';
  if v_cash is null then
    raise exception 'this family has no cash account — run the bootstrap';
  end if;
  v_journal := post_journal_as(
    v_row.family_id, v_me.id, v_row.drive_date,
    coalesce(p_memo, 'car shortfall ' || to_char(v_row.drive_date, 'DD Mon')),
    jsonb_build_array(
      jsonb_build_object('account_id', v_cat.account_id, 'amount', v_amount,
                         'category_id', v_cat.id, 'person_id', v_row.submitted_by),
      jsonb_build_object('account_id', v_cash, 'amount', -v_amount)
    ),
    'car_days', p_day, p_client_uuid
  );
  update car_days set loss_journal_id = v_journal where id = p_day;
  return v_journal;
end $$;
create or replace function confirm_handover(
  p_family      uuid,
  p_day_ids     uuid[],
  p_received_on date,
  p_counted_egp bigint,
  p_note        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_amount   bigint;
  v_journal  uuid;
  v_handover uuid;
  v_count    int;
  v_cash     uuid;
  v_due      uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin confirms a handover'
      using errcode = 'insufficient_privilege';
  end if;
  if p_counted_egp is null or p_counted_egp <= 0 then
    raise exception 'a handover records what was actually counted, in piastres';
  end if;
  if p_received_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if p_client_uuid is not null then
    select id into v_handover from car_handovers where client_uuid = p_client_uuid;
    if v_handover is not null then return v_handover; end if;
  end if;
  select coalesce(sum(family_egp + marwa_egp), 0), count(*)
    into v_amount, v_count
    from car_days
   where family_id = p_family
     and id = any (p_day_ids)
     and status = 'recorded'
     and voided_at is null
     and family_egp + marwa_egp > 0;      
  if v_count = 0 then
    raise exception 'no unsettled days in that selection';
  end if;
  select id into v_cash from accounts where family_id = p_family and system_key = 'cash';
  select id into v_due  from accounts where family_id = p_family and system_key = 'due_from_driver';
  if v_cash is null or v_due is null then
    raise exception 'this family has no cash or due_from_driver account — run the bootstrap';
  end if;
  v_journal := post_journal(
    p_family, p_received_on, coalesce(p_note, 'car handover'),
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash, 'amount',  p_counted_egp),
      jsonb_build_object('account_id', v_due,  'amount', -p_counted_egp)
    ),
    'car_handovers', null, p_client_uuid
  );
  insert into car_handovers (family_id, received_on, amount_egp, counted_egp,
                             confirmed_by, journal_id, note, client_uuid)
       values (p_family, p_received_on, v_amount, p_counted_egp,
               v_me.id, v_journal, p_note, p_client_uuid)
    returning id into v_handover;
  update car_days
     set status = 'settled', handover_id = v_handover
   where family_id = p_family and id = any (p_day_ids)
     and status = 'recorded' and voided_at is null
     and family_egp + marwa_egp > 0;
  return v_handover;
end $$;
create or replace function pay_allowance(
  p_family      uuid,
  p_recipient   uuid,
  p_period      date,
  p_paid_on     date default current_date,
  p_amount      bigint default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me        people;
  v_cat       categories;
  v_cash      uuid;
  v_payable   uuid;
  v_sharer    uuid;
  v_owed      bigint := 0;
  v_amount    bigint;
  v_lines     jsonb;
  v_journal   uuid;
  v_allowance uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin pays an allowance'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_allowance from allowances where client_uuid = p_client_uuid;
    if v_allowance is not null then return v_allowance; end if;
  end if;
  if p_period <> date_trunc('month', p_period)::date then
    raise exception 'a period is the first of its month, got %', p_period;
  end if;
  if p_paid_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if not exists (select 1 from people
                  where id = p_recipient and family_id = p_family and active) then
    raise exception 'that person is not in this family'
      using errcode = 'insufficient_privilege';
  end if;
  v_amount := coalesce(
    p_amount,
    allowance_rate_on(p_recipient, (p_period + interval '1 month - 1 day')::date));
  if v_amount is null then
    raise exception 'no allowance rate has been set for that person';
  end if;
  if v_amount <= 0 then
    raise exception 'there is nothing to pay for that month';
  end if;
  if exists (select 1 from allowances
              where recipient_id = p_recipient and period = p_period) then
    raise exception 'that month has already been paid';
  end if;
  select * into v_cat from categories
   where family_id = p_family and purpose = 'allowance' and active;
  if v_cat.id is null then
    raise exception 'this family has no Allowance category — run the bootstrap';
  end if;
  select id into v_cash from accounts
   where family_id = p_family and system_key = 'cash';
  if v_cash is null then
    raise exception 'this family has no cash account — run the bootstrap';
  end if;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_cat.account_id, 'amount', v_amount,
                       'category_id', v_cat.id, 'person_id', p_recipient));
  select car_share_person into v_sharer from families where id = p_family;
  if v_sharer = p_recipient then
    select a.id, -coalesce(sum(e.amount), 0)
      into v_payable, v_owed
      from accounts a
      left join entries e on e.account_id = a.id
     where a.family_id = p_family and a.system_key = 'car_share_payable'
     group by a.id;
    if v_payable is not null and v_owed > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_id', v_payable, 'amount', v_owed,
                           'person_id', p_recipient));
    else
      v_owed := 0;
    end if;
  end if;
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('account_id', v_cash, 'amount', -(v_amount + v_owed)));
  v_journal := post_journal(
    p_family, p_paid_on,
    'allowance ' || to_char(p_period, 'Mon YYYY')
      || case when v_owed > 0 then ' + car share' else '' end,
    v_lines, 'allowances', null, p_client_uuid);
  insert into allowances (family_id, recipient_id, period, amount_egp,
                          paid_on, paid_by, journal_id, client_uuid)
       values (p_family, p_recipient, p_period, v_amount,
               p_paid_on, v_me.id, v_journal, p_client_uuid)
    returning id into v_allowance;
  return v_allowance;
end $$;
`,p=`
alter table remittances add column if not exists voided_at   timestamptz;
alter table remittances add column if not exists void_reason text;
create or replace function record_remittance(
  p_family          uuid,
  p_from_person     uuid,
  p_amount_original bigint,        
  p_currency        char(3),
  p_fx_rate         numeric,       
  p_received_on     date,
  p_visit_note      text default null,
  p_client_uuid     uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me     people;
  v_cash   uuid;
  v_income uuid;
  v_egp    bigint;
  v_journal uuid;
  v_id     uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin records a remittance'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_id from remittances where client_uuid = p_client_uuid;
    if v_id is not null then return v_id; end if;
  end if;
  if p_currency not in ('EGP','SAR','USD') then
    raise exception 'currency must be EGP, SAR or USD, got %', p_currency;
  end if;
  if p_amount_original is null or p_amount_original <= 0 then
    raise exception 'an amount must be a positive number of minor units';
  end if;
  if p_fx_rate is null or p_fx_rate <= 0 then
    raise exception 'a rate must be greater than zero';
  end if;
  if p_currency = 'EGP' and p_fx_rate <> 1 then
    raise exception 'EGP converts to EGP at 1, not %', p_fx_rate;
  end if;
  if p_received_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if not exists (select 1 from people
                  where id = p_from_person and family_id = p_family) then
    raise exception 'that person is not in this family'
      using errcode = 'insufficient_privilege';
  end if;
  v_egp := round(p_amount_original * p_fx_rate)::bigint;
  if v_egp <= 0 then
    raise exception 'that comes to nothing in EGP — check the rate';
  end if;
  select id into v_cash   from accounts where family_id = p_family and system_key = 'cash';
  select id into v_income from accounts where family_id = p_family and system_key = 'remittance_income';
  if v_cash is null or v_income is null then
    raise exception 'this family has no cash or remittance account — run the bootstrap';
  end if;
  v_journal := post_journal_as(
    p_family, v_me.id, p_received_on,
    coalesce(p_visit_note, 'remittance'),
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash,   'amount',  v_egp),
      jsonb_build_object('account_id', v_income, 'amount', -v_egp,
                         'person_id', p_from_person)
    ),
    'remittances', null, p_client_uuid);
  insert into remittances (family_id, from_person, amount_original, currency,
                           fx_rate, amount_egp, received_on, rate_set_by,
                           visit_note, journal_id, client_uuid)
       values (p_family, p_from_person, p_amount_original, p_currency,
               p_fx_rate, v_egp, p_received_on, v_me.id,
               p_visit_note, v_journal, p_client_uuid)
    returning id into v_id;
  return v_id;
end $$;
create or replace function void_remittance(p_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row remittances;
  v_me  people;
begin
  select * into v_row from remittances where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin voids a remittance'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then return false; end if;
  if v_row.journal_id is not null then
    perform post_journal_as(
      v_row.family_id, v_me.id, current_date,
      coalesce(p_reason, 'voided remittance'),
      (select jsonb_agg(jsonb_build_object(
                'account_id', e.account_id, 'amount', -e.amount,
                'person_id',  e.person_id,  'category_id', e.category_id))
         from entries e where e.journal_id = v_row.journal_id),
      'remittances', p_id, null);
  end if;
  update remittances set voided_at = now(), void_reason = p_reason where id = p_id;
  return true;
end $$;
drop policy if exists remittances_write on remittances;
create policy remittances_no_direct_write on remittances for insert with check (false);
`,m=`
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Africa/Cairo');
end $$;
do $$
declare r text;
begin
  foreach r in array array['authenticator','anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('alter role %I set timezone to %L', r, 'Africa/Cairo');
    end if;
  end loop;
end $$;
alter table families
  add column if not exists timezone text not null default 'Africa/Cairo';
create or replace function family_today(p_family uuid) returns date
language sql stable set search_path = public as $$
  select (now() at time zone
          coalesce((select timezone from families where id = p_family), 'Africa/Cairo'))::date
$$;
`,h=`
insert into accounts (family_id, kind, name, system_key)
select f.id, 'asset', 'Loans owed to us', 'loan_receivable'
  from families f
 where not exists (
   select 1 from accounts a
    where a.family_id = f.id and a.system_key = 'loan_receivable');
alter table loans         add column if not exists voided_at   timestamptz;
alter table loans         add column if not exists void_reason text;
alter table loan_payments add column if not exists voided_at   timestamptz;
alter table loan_payments add column if not exists void_reason text;
create or replace function record_loan(
  p_family       uuid,
  p_direction    text,      
  p_counterparty text,
  p_principal    bigint,    
  p_taken_on     date,
  p_description  text default null,
  p_client_uuid  uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me      people;
  v_cash    uuid;
  v_other   uuid;
  v_journal uuid;
  v_id      uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin registers a loan'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_id from loans where client_uuid = p_client_uuid;
    if v_id is not null then return v_id; end if;
  end if;
  if p_direction not in ('borrowed','lent') then
    raise exception 'a loan is borrowed or lent, got %', p_direction;
  end if;
  if coalesce(btrim(p_counterparty), '') = '' then
    raise exception 'a loan needs a name — who lent it, or who has it';
  end if;
  if p_principal is null or p_principal <= 0 then
    raise exception 'a loan must be a positive number of piastres';
  end if;
  if p_taken_on > family_today(p_family) then
    raise exception 'that day has not happened yet';
  end if;
  select id into v_cash from accounts where family_id = p_family and system_key = 'cash';
  select id into v_other from accounts
   where family_id = p_family
     and system_key = case when p_direction = 'borrowed'
                           then 'loan_liability' else 'loan_receivable' end;
  if v_cash is null or v_other is null then
    raise exception 'this family has no cash or loan account — run the bootstrap';
  end if;
  v_journal := post_journal_as(
    p_family, v_me.id, p_taken_on,
    coalesce(p_description,
             case when p_direction = 'borrowed' then 'borrowed from ' else 'lent to ' end
             || p_counterparty),
    case when p_direction = 'borrowed' then
      jsonb_build_array(
        jsonb_build_object('account_id', v_cash,  'amount',  p_principal),
        jsonb_build_object('account_id', v_other, 'amount', -p_principal))
    else
      jsonb_build_array(
        jsonb_build_object('account_id', v_other, 'amount',  p_principal),
        jsonb_build_object('account_id', v_cash,  'amount', -p_principal))
    end,
    'loans', null, p_client_uuid);
  insert into loans (family_id, direction, counterparty, principal_egp,
                     taken_on, description, journal_id, client_uuid)
       values (p_family, p_direction, btrim(p_counterparty), p_principal,
               p_taken_on, p_description, v_journal, p_client_uuid)
    returning id into v_id;
  return v_id;
end $$;
create or replace function record_loan_payment(
  p_loan        uuid,
  p_amount      bigint,
  p_paid_on     date,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_loan      loans;
  v_me        people;
  v_cash      uuid;
  v_other     uuid;
  v_remaining bigint;
  v_journal   uuid;
  v_id        uuid;
begin
  select * into v_loan from loans where id = p_loan;
  if v_loan.id is null then raise exception 'no such loan'; end if;
  v_me := my_person(v_loan.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin records a repayment'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_id from loan_payments where client_uuid = p_client_uuid;
    if v_id is not null then return v_id; end if;
  end if;
  if v_loan.voided_at is not null then raise exception 'that loan was voided'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'a repayment must be a positive number of piastres';
  end if;
  if p_paid_on > family_today(v_loan.family_id) then
    raise exception 'that day has not happened yet';
  end if;
  select v_loan.principal_egp - coalesce(sum(amount_egp), 0)
    into v_remaining
    from loan_payments where loan_id = p_loan and voided_at is null;
  if p_amount > v_remaining then
    raise exception 'that is more than the % still outstanding', v_remaining;
  end if;
  select id into v_cash from accounts
   where family_id = v_loan.family_id and system_key = 'cash';
  select id into v_other from accounts
   where family_id = v_loan.family_id
     and system_key = case when v_loan.direction = 'borrowed'
                           then 'loan_liability' else 'loan_receivable' end;
  v_journal := post_journal_as(
    v_loan.family_id, v_me.id, p_paid_on,
    case when v_loan.direction = 'borrowed' then 'repaid ' else 'repaid by ' end
      || v_loan.counterparty,
    case when v_loan.direction = 'borrowed' then
      jsonb_build_array(
        jsonb_build_object('account_id', v_other, 'amount',  p_amount),
        jsonb_build_object('account_id', v_cash,  'amount', -p_amount))
    else
      jsonb_build_array(
        jsonb_build_object('account_id', v_cash,  'amount',  p_amount),
        jsonb_build_object('account_id', v_other, 'amount', -p_amount))
    end,
    'loan_payments', p_loan, p_client_uuid);
  insert into loan_payments (loan_id, amount_egp, paid_on, journal_id, client_uuid)
       values (p_loan, p_amount, p_paid_on, v_journal, p_client_uuid)
    returning id into v_id;
  return v_id;
end $$;
create or replace function void_loan_payment(p_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row loan_payments;
  v_fam uuid;
  v_me  people;
begin
  select * into v_row from loan_payments where id = p_id;
  if v_row.id is null then return false; end if;
  select family_id into v_fam from loans where id = v_row.loan_id;
  v_me := my_person(v_fam);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin voids a repayment'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then return false; end if;
  perform post_journal_as(
    v_fam, v_me.id, family_today(v_fam), coalesce(p_reason, 'voided repayment'),
    (select jsonb_agg(jsonb_build_object(
              'account_id', e.account_id, 'amount', -e.amount,
              'person_id', e.person_id, 'category_id', e.category_id))
       from entries e where e.journal_id = v_row.journal_id),
    'loan_payments', p_id, null);
  update loan_payments set voided_at = now(), void_reason = p_reason where id = p_id;
  return true;
end $$;
create or replace function void_loan(p_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row loans;
  v_me  people;
begin
  select * into v_row from loans where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin voids a loan'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then return false; end if;
  if exists (select 1 from loan_payments
              where loan_id = p_id and voided_at is null) then
    raise exception 'that loan has repayments against it — void those first';
  end if;
  perform post_journal_as(
    v_row.family_id, v_me.id, family_today(v_row.family_id),
    coalesce(p_reason, 'voided loan'),
    (select jsonb_agg(jsonb_build_object(
              'account_id', e.account_id, 'amount', -e.amount,
              'person_id', e.person_id, 'category_id', e.category_id))
       from entries e where e.journal_id = v_row.journal_id),
    'loans', p_id, null);
  update loans set voided_at = now(), void_reason = p_reason where id = p_id;
  return true;
end $$;
drop view if exists loan_balances;
create view loan_balances as
  select l.id as loan_id,
         l.family_id,
         l.direction,
         l.counterparty,
         l.principal_egp,
         l.taken_on,
         l.description,
         coalesce(sum(p.amount_egp) filter (where p.voided_at is null), 0)
           as repaid_egp,
         l.principal_egp - coalesce(sum(p.amount_egp) filter (where p.voided_at is null), 0)
           as remaining_egp,
         max(p.paid_on) filter (where p.voided_at is null) as last_paid_on,
         case
           when coalesce(sum(p.amount_egp) filter (where p.voided_at is null), 0)
                >= l.principal_egp then 'repaid'
           when coalesce(sum(p.amount_egp) filter (where p.voided_at is null), 0)
                > 0 then 'partial'
           else 'outstanding'
         end as status
    from loans l
    left join loan_payments p on p.loan_id = l.id
   where l.voided_at is null
   group by l.id;
alter view loan_balances set (security_invoker = on);
drop policy if exists loans_write on loans;
create policy loans_no_direct_write on loans for insert with check (false);
create policy loan_payments_no_direct_write on loan_payments for insert with check (false);
`,g=`
alter table people
  add column if not exists timezone text;
create or replace function person_today(p_person uuid) returns date
language sql stable set search_path = public as $$
  select (now() at time zone coalesce(p.timezone, f.timezone, 'Africa/Cairo'))::date
  from people p
  join families f on f.id = p.family_id
  where p.id = p_person
$$;
alter table personal_entries drop constraint if exists pe_not_future;
create or replace function assert_personal_day() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(person_today(new.person_id), family_today(new.family_id));
begin
  if new.occurred_on > v_today then
    raise exception 'that day has not started yet where this person is (their today is %)', v_today
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create or replace trigger personal_not_future before insert or update on personal_entries
  for each row execute function assert_personal_day();
create or replace trigger personal_person_in_family before insert or update on personal_entries
  for each row execute function assert_person_in_family('person_id');
`,_=`
create or replace function assert_family_keeps_an_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_left int;
begin
  if not exists (select 1 from families where id = old.family_id) then
    return null;
  end if;
  select count(*) into v_left
    from people
   where family_id    = old.family_id
     and role         = 'admin'
     and active
     and auth_user_id is not null;
  if v_left = 0 then
    raise exception
      'this would leave the family with no admin who can sign in; make somebody else an admin first'
      using errcode = 'restrict_violation';
  end if;
  return null;
end $$;
create or replace trigger people_keep_an_admin
  after update or delete on people
  for each row
  when (old.role = 'admin' and old.active and old.auth_user_id is not null)
  execute function assert_family_keeps_an_admin();
`,v=`
create or replace function add_category(
  p_family          uuid,
  p_name_en         text,
  p_name_ar         text,
  p_kind            text,
  p_colour          text    default null,
  p_needs_recipient boolean default false
) returns categories
language plpgsql security definer set search_path = public as $$
declare
  v_me      people;
  v_account uuid;
  v_row     categories;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin can add a category'
      using errcode = 'insufficient_privilege';
  end if;
  if p_kind not in ('income', 'expense') then
    raise exception 'a category is either income or expense'
      using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_name_en), '') = '' or coalesce(btrim(p_name_ar), '') = '' then
    raise exception 'a category needs a name in both languages'
      using errcode = 'check_violation';
  end if;
  insert into accounts (family_id, kind, name)
  values (p_family,
          case when p_kind = 'income' then 'income' else 'expense' end::account_kind,
          btrim(p_name_en))
  returning id into v_account;
  insert into categories (family_id, name_en, name_ar, kind, account_id,
                          colour, needs_recipient)
  values (p_family, btrim(p_name_en), btrim(p_name_ar), p_kind, v_account,
          nullif(btrim(coalesce(p_colour, '')), ''), coalesce(p_needs_recipient, false))
  returning * into v_row;
  return v_row;
end $$;
`,y=`
create or replace function assert_category_in_family() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_column   text := tg_argv[0];
  v_category uuid := (to_jsonb(new) ->> v_column)::uuid;
begin
  if v_category is not null and not exists (
    select 1 from categories
     where id = v_category and family_id = new.family_id
  ) then
    raise exception '%.% must name a category in this family', tg_table_name, v_column
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create or replace trigger me_category_in_family
  before insert or update on member_expenses
  for each row execute function assert_category_in_family('category_id');
`,b=`
alter table people
  add column if not exists must_set_password boolean not null default false;
create or replace function mark_password_set() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_rows int;
begin
  update people
     set must_set_password = false
   where auth_user_id = auth.uid()
     and must_set_password;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
`,x=`
alter table allowances add column if not exists voided_at   timestamptz;
alter table allowances add column if not exists void_reason text;
alter table allowances drop constraint if exists allowances_recipient_id_period_key;
create unique index if not exists allowances_one_live_payment_per_month
  on allowances (recipient_id, period) where voided_at is null;
create or replace function pay_allowance(
  p_family      uuid,
  p_recipient   uuid,
  p_period      date,
  p_paid_on     date default current_date,
  p_amount      bigint default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me        people;
  v_cat       categories;
  v_cash      uuid;
  v_payable   uuid;
  v_sharer    uuid;
  v_owed      bigint := 0;
  v_amount    bigint;
  v_lines     jsonb;
  v_journal   uuid;
  v_allowance uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin pays an allowance'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_allowance from allowances where client_uuid = p_client_uuid;
    if v_allowance is not null then return v_allowance; end if;
  end if;
  if p_period <> date_trunc('month', p_period)::date then
    raise exception 'a period is the first of its month, got %', p_period;
  end if;
  if p_paid_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if not exists (select 1 from people
                  where id = p_recipient and family_id = p_family and active) then
    raise exception 'that person is not in this family'
      using errcode = 'insufficient_privilege';
  end if;
  v_amount := coalesce(
    p_amount,
    allowance_rate_on(p_recipient, (p_period + interval '1 month - 1 day')::date));
  if v_amount is null then
    raise exception 'no allowance rate has been set for that person';
  end if;
  if v_amount <= 0 then
    raise exception 'there is nothing to pay for that month';
  end if;
  if exists (select 1 from allowances
              where recipient_id = p_recipient and period = p_period
                and voided_at is null) then
    raise exception 'that month has already been paid';
  end if;
  select * into v_cat from categories
   where family_id = p_family and purpose = 'allowance' and active;
  if v_cat.id is null then
    raise exception 'this family has no Allowance category — run the bootstrap';
  end if;
  select id into v_cash from accounts
   where family_id = p_family and system_key = 'cash';
  if v_cash is null then
    raise exception 'this family has no cash account — run the bootstrap';
  end if;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_cat.account_id, 'amount', v_amount,
                       'category_id', v_cat.id, 'person_id', p_recipient));
  select car_share_person into v_sharer from families where id = p_family;
  if v_sharer = p_recipient then
    select a.id, -coalesce(sum(e.amount), 0)
      into v_payable, v_owed
      from accounts a
      left join entries e on e.account_id = a.id
     where a.family_id = p_family and a.system_key = 'car_share_payable'
     group by a.id;
    if v_payable is not null and v_owed > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_id', v_payable, 'amount', v_owed,
                           'person_id', p_recipient));
    else
      v_owed := 0;
    end if;
  end if;
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('account_id', v_cash, 'amount', -(v_amount + v_owed)));
  v_journal := post_journal(
    p_family, p_paid_on,
    'allowance ' || to_char(p_period, 'Mon YYYY')
      || case when v_owed > 0 then ' + car share' else '' end,
    v_lines, 'allowances', null, p_client_uuid);
  insert into allowances (family_id, recipient_id, period, amount_egp,
                          paid_on, paid_by, journal_id, client_uuid)
       values (p_family, p_recipient, p_period, v_amount,
               p_paid_on, v_me.id, v_journal, p_client_uuid)
    returning id into v_allowance;
  return v_allowance;
end $$;
create or replace function void_allowance(p_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row allowances;
  v_me  people;
begin
  select * into v_row from allowances where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin voids an allowance'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then return false; end if;
  perform post_journal_as(
    v_row.family_id, v_me.id, family_today(v_row.family_id),
    coalesce(p_reason, 'voided allowance'),
    (select jsonb_agg(jsonb_build_object(
              'account_id', e.account_id, 'amount', -e.amount,
              'person_id',  e.person_id,  'category_id', e.category_id))
       from entries e where e.journal_id = v_row.journal_id),
    'allowances', p_id, null);
  update allowances set voided_at = now(), void_reason = p_reason where id = p_id;
  return true;
end $$;
create or replace view member_balances as
  with recipients as (
    select family_id, recipient_id as person_id from allowance_rates
    union
    select family_id, recipient_id from allowances where voided_at is null
    union
    select family_id, person_id from member_expenses
  ),
  paid as (
    select family_id, recipient_id as person_id,
           sum(amount_egp) as received,
           max(period)     as last_period
      from allowances where voided_at is null group by family_id, recipient_id
  ),
  spent as (
    select family_id, person_id,
           coalesce(sum(amount_egp) filter (where status = 'approved'), 0) as approved,
           coalesce(sum(amount_egp) filter (where status = 'pending'),  0) as pending,
           count(*) filter (where status = 'pending')                      as pending_count
      from member_expenses group by family_id, person_id
  )
  select r.family_id,
         r.person_id,
         coalesce(p.received, 0)                            as received,
         coalesce(s.approved, 0)                            as approved,
         coalesce(p.received, 0) - coalesce(s.approved, 0)  as balance,
         coalesce(s.pending, 0)                             as pending,
         coalesce(s.pending_count, 0)                       as pending_count,
         p.last_period,
         allowance_rate_on(r.person_id, current_date)       as rate
    from recipients r
    left join paid  p on p.family_id = r.family_id and p.person_id = r.person_id
    left join spent s on s.family_id = r.family_id and s.person_id = r.person_id;
alter view member_balances set (security_invoker = on);
drop policy if exists allowances_write on allowances;
create policy allowances_no_direct_write on allowances for insert with check (false);
`,S=`
create or replace function reverse_journal(p_journal uuid, p_memo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src     journals;
  v_me      people;
  v_journal uuid;
begin
  select * into v_src from journals where id = p_journal;
  if v_src.id is null then
    raise exception 'no such journal' using errcode = 'insufficient_privilege';
  end if;
  v_me := my_person(v_src.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin reverses a journal'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from journals where reverses = p_journal) then
    raise exception 'that entry has already been corrected'
      using errcode = 'check_violation';
  end if;
  insert into journals (family_id, occurred_on, recorded_by, memo, reverses)
       values (v_src.family_id, family_today(v_src.family_id), v_me.id,
               coalesce(p_memo, 'reversal'), p_journal)
    returning id into v_journal;
  insert into entries (journal_id, account_id, amount, person_id, category_id)
  select v_journal, account_id, -amount, person_id, category_id
    from entries where journal_id = p_journal;
  return v_journal;
end $$;
`,C=`
create or replace function correct_transaction(
  p_journal     uuid,
  p_kind        text,      
  p_category    uuid,
  p_amount      bigint,    
  p_occurred_on date,
  p_person      uuid default null,
  p_memo        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src journals;
  v_me  people;
begin
  select * into v_src from journals where id = p_journal;
  if v_src.id is null then
    raise exception 'no such entry' using errcode = 'insufficient_privilege';
  end if;
  v_me := my_person(v_src.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin corrects an entry'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(v_src.source_table, '') <> 'record_transaction' then
    raise exception
      'that entry was made by another screen and has to be corrected there'
      using errcode = 'check_violation';
  end if;
  perform reverse_journal(p_journal, coalesce(p_memo, 'correction'));
  return record_transaction(
    v_src.family_id, p_kind, p_category, p_amount, p_occurred_on,
    p_person, p_memo, p_client_uuid);
end $$;
`,w=`
create or replace view ledger_feed as
  select
    e.id                as entry_id,
    j.id                as journal_id,
    j.family_id,
    j.occurred_on,
    j.recorded_at,
    j.memo,
    j.reverses,
    c.id                as category_id,
    c.name_en           as category_en,
    c.name_ar           as category_ar,
    c.colour            as category_colour,
    c.kind              as category_kind,
    p.id                as person_id,
    p.display_name      as person_name,
    a.kind              as account_kind,
    case when a.kind = 'expense' then -e.amount
         when a.kind = 'income'  then -e.amount
         else e.amount end as signed_amount,
    abs(e.amount)       as amount,
    j.source_table
  from entries e
  join journals   j on j.id = e.journal_id
  join accounts   a on a.id = e.account_id
  left join categories c on c.id = e.category_id
  left join people     p on p.id = e.person_id
  where a.system_key is distinct from 'cash';
alter view ledger_feed set (security_invoker = on);
create or replace function delete_transaction(p_journal uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src journals;
  v_me  people;
begin
  select * into v_src from journals where id = p_journal;
  if v_src.id is null then
    raise exception 'no such entry' using errcode = 'insufficient_privilege';
  end if;
  v_me := my_person(v_src.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin removes an entry'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(v_src.source_table, '') <> 'record_transaction' then
    raise exception
      'that entry was made by another screen and has to be removed there'
      using errcode = 'check_violation';
  end if;
  return reverse_journal(p_journal, coalesce(p_reason, 'deleted'));
end $$;
`,T=`
create or replace view ledger_feed as
  select
    e.id                as entry_id,
    j.id                as journal_id,
    j.family_id,
    j.occurred_on,
    j.recorded_at,
    j.memo,
    j.reverses,
    c.id                as category_id,
    c.name_en           as category_en,
    c.name_ar           as category_ar,
    c.colour            as category_colour,
    c.kind              as category_kind,
    p.id                as person_id,
    p.display_name      as person_name,
    a.kind              as account_kind,
    case when a.kind = 'expense' then -e.amount
         when a.kind = 'income'  then -e.amount
         else e.amount end as signed_amount,
    abs(e.amount)       as amount,
    j.source_table,
    exists (select 1 from journals r where r.reverses = j.id) as reversed
  from entries e
  join journals   j on j.id = e.journal_id
  join accounts   a on a.id = e.account_id
  left join categories c on c.id = e.category_id
  left join people     p on p.id = e.person_id
  where a.system_key is distinct from 'cash';
alter view ledger_feed set (security_invoker = on);
`,E=`
alter table families
  add column if not exists car_owner_person uuid references people;
create or replace function record_car_day(
  p_family      uuid,
  p_drive_date  date,
  p_worked      boolean,
  p_gross       bigint  default 0,
  p_expenses    jsonb   default '[]',
  p_client_uuid uuid    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_day      uuid;
  v_direct   bigint := 0;
  v_indirect bigint := 0;
  v_net      bigint;
  v_driver   bigint := 0;
  v_family   bigint := 0;
  v_marwa    bigint := 0;
  v_split    record;
  v_line     jsonb;
  v_due      uuid;
  v_payable  uuid;
  v_sharer   uuid;
  v_owner    uuid;
  v_journal  uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'driver' then
    raise exception 'only the driver records a day'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_day from car_days where client_uuid = p_client_uuid;
    if v_day is not null then return v_day; end if;
  end if;
  if p_drive_date > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if p_gross is null or p_gross < 0 then
    raise exception 'takings cannot be negative';
  end if;
  if not p_worked then
    if p_gross <> 0 or jsonb_array_length(p_expenses) > 0 then
      raise exception 'a day off has no takings and no costs';
    end if;
    insert into car_days (family_id, drive_date, worked, status, submitted_by, client_uuid)
         values (p_family, p_drive_date, false, 'off', v_me.id, p_client_uuid)
      returning id into v_day;
    return v_day;
  end if;
  for v_line in select * from jsonb_array_elements(p_expenses) loop
    if (v_line->>'class') not in ('direct','indirect') then
      raise exception 'a cost is direct or indirect, got %', v_line->>'class';
    end if;
    if (v_line->>'amount_egp')::bigint <= 0 then
      raise exception 'a cost must be a positive number of piastres';
    end if;
    if (v_line->>'class') = 'direct'
      then v_direct   := v_direct   + (v_line->>'amount_egp')::bigint;
      else v_indirect := v_indirect + (v_line->>'amount_egp')::bigint;
    end if;
  end loop;
  v_net := p_gross - v_direct - v_indirect;
  if v_net > 0 then
    select * into v_split from car_split(v_net);
    v_driver := v_split.driver_egp;
    v_family := v_split.family_egp;
    v_marwa  := v_split.marwa_egp;
  end if;
  insert into car_days (family_id, drive_date, worked, gross_egp, direct_egp,
                        indirect_egp, net_egp, driver_egp, family_egp, marwa_egp,
                        status, submitted_by, client_uuid)
       values (p_family, p_drive_date, true, p_gross, v_direct, v_indirect,
               v_net, v_driver, v_family, v_marwa,
               'recorded', v_me.id, p_client_uuid)
    returning id into v_day;
  for v_line in select * from jsonb_array_elements(p_expenses) loop
    insert into car_expenses (car_day_id, label, class, amount_egp, description)
    values (v_day, v_line->>'label', v_line->>'class',
            (v_line->>'amount_egp')::bigint, nullif(v_line->>'description',''));
  end loop;
  if v_family + v_marwa > 0 then
    select id into v_due     from accounts where family_id = p_family and system_key = 'due_from_driver';
    select id into v_payable from accounts where family_id = p_family and system_key = 'car_share_payable';
    select car_share_person, car_owner_person into v_sharer, v_owner
      from families where id = p_family;
    if v_due is null or v_payable is null then
      raise exception 'this family is missing a car account — run the bootstrap';
    end if;
    if v_owner is null then
      raise exception 'this family has not said who owns the car — set car_owner_person';
    end if;
    v_journal := post_journal_as(
      p_family, v_me.id, p_drive_date,
      'car ' || to_char(p_drive_date, 'DD Mon'),
      jsonb_build_array(
        jsonb_build_object('account_id', v_due,     'amount',  v_family + v_marwa,
                           'person_id', v_me.id),
        jsonb_build_object('account_id', v_payable, 'amount', -v_family,
                           'person_id', v_owner),
        jsonb_build_object('account_id', v_payable, 'amount', -v_marwa,
                           'person_id', v_sharer)
      ),
      'car_days', v_day, null
    );
    update car_days set journal_id = v_journal where id = v_day;
  end if;
  return v_day;
end $$;
create or replace function settle_car_owner(
  p_family      uuid,
  p_person      uuid,
  p_amount      bigint,      
  p_paid_on     date default current_date,
  p_note        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me      people;
  v_cash    uuid;
  v_payable uuid;
  v_owed    bigint;
  v_journal uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin settles the car'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_journal from journals where client_uuid = p_client_uuid;
    if v_journal is not null then return v_journal; end if;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'a settlement is a positive number of piastres';
  end if;
  if p_paid_on > family_today(p_family) then
    raise exception 'that day has not happened yet';
  end if;
  if not exists (select 1 from people
                  where id = p_person and family_id = p_family) then
    raise exception 'that person is not in this family'
      using errcode = 'insufficient_privilege';
  end if;
  select id into v_cash    from accounts where family_id = p_family and system_key = 'cash';
  select id into v_payable from accounts where family_id = p_family and system_key = 'car_share_payable';
  if v_cash is null or v_payable is null then
    raise exception 'this family is missing a car account — run the bootstrap';
  end if;
  select coalesce(-sum(e.amount), 0) into v_owed
    from entries e
   where e.account_id = v_payable and e.person_id = p_person;
  if p_amount > v_owed then
    raise exception 'that is more than the % owed to them', v_owed;
  end if;
  v_journal := post_journal(
    p_family, p_paid_on, coalesce(p_note, 'car share paid'),
    jsonb_build_array(
      jsonb_build_object('account_id', v_payable, 'amount', p_amount,
                         'person_id', p_person),
      jsonb_build_object('account_id', v_cash, 'amount', -p_amount)
    ),
    'car_owner_settlement', null, p_client_uuid);
  return v_journal;
end $$;
`,D=`
create or replace function pay_allowance(
  p_family      uuid,
  p_recipient   uuid,
  p_period      date,
  p_paid_on     date default current_date,
  p_amount      bigint default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me        people;
  v_cat       categories;
  v_cash      uuid;
  v_amount    bigint;
  v_lines     jsonb;
  v_journal   uuid;
  v_allowance uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin pays an allowance'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_allowance from allowances where client_uuid = p_client_uuid;
    if v_allowance is not null then return v_allowance; end if;
  end if;
  if p_period <> date_trunc('month', p_period)::date then
    raise exception 'a period is the first of its month, got %', p_period;
  end if;
  if p_paid_on > current_date then
    raise exception 'that day has not happened yet';
  end if;
  if not exists (select 1 from people
                  where id = p_recipient and family_id = p_family and active) then
    raise exception 'that person is not in this family'
      using errcode = 'insufficient_privilege';
  end if;
  v_amount := coalesce(
    p_amount,
    allowance_rate_on(p_recipient, (p_period + interval '1 month - 1 day')::date));
  if v_amount is null then
    raise exception 'no allowance rate has been set for that person';
  end if;
  if v_amount <= 0 then
    raise exception 'there is nothing to pay for that month';
  end if;
  if exists (select 1 from allowances
              where recipient_id = p_recipient and period = p_period
                and voided_at is null) then
    raise exception 'that month has already been paid';
  end if;
  select * into v_cat from categories
   where family_id = p_family and purpose = 'allowance' and active;
  if v_cat.id is null then
    raise exception 'this family has no Allowance category — run the bootstrap';
  end if;
  select id into v_cash from accounts
   where family_id = p_family and system_key = 'cash';
  if v_cash is null then
    raise exception 'this family has no cash account — run the bootstrap';
  end if;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_cat.account_id, 'amount', v_amount,
                       'category_id', v_cat.id, 'person_id', p_recipient),
    jsonb_build_object('account_id', v_cash, 'amount', -v_amount));
  v_journal := post_journal(
    p_family, p_paid_on,
    'allowance ' || to_char(p_period, 'Mon YYYY'),
    v_lines, 'allowances', null, p_client_uuid);
  insert into allowances (family_id, recipient_id, period, amount_egp,
                          paid_on, paid_by, journal_id, client_uuid)
       values (p_family, p_recipient, p_period, v_amount,
               p_paid_on, v_me.id, v_journal, p_client_uuid)
    returning id into v_allowance;
  return v_allowance;
end $$;
`,ne=`
truncate table
  entries, journals,
  allowances, allowance_rates,
  remittances, personal_entries,
  loan_payments, loans,
  member_expenses, period_closes,
  car_expenses, car_days, car_handovers;
drop function if exists record_car_day(uuid, date, boolean, bigint, jsonb, uuid);
drop function if exists void_car_day(uuid, text);
drop function if exists confirm_handover(uuid, uuid[], date, bigint, text, uuid);
drop function if exists settle_car_loss(uuid, uuid, text, uuid);
drop function if exists settle_car_owner(uuid, uuid, bigint, date, text, uuid);
drop function if exists car_split(bigint);
drop table car_expenses;
drop table car_days;
drop table car_handovers;
drop type if exists car_day_status;
alter table families add column if not exists car_value_egp      bigint;
alter table families add column if not exists car_share_paid_egp bigint;
alter table families drop constraint if exists car_shares_are_sane;
alter table families add constraint car_shares_are_sane check (
  car_value_egp is null
  or (car_value_egp > 0 and car_share_paid_egp between 0 and car_value_egp));
create table car_days (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references families on delete cascade,
  kind           text not null default 'day' check (kind in ('day','cost')),
  drive_date     date not null,
  revenue_egp    bigint not null default 0 check (revenue_egp  >= 0),
  fuel_egp       bigint not null default 0 check (fuel_egp     >= 0),
  indirect_egp   bigint not null default 0 check (indirect_egp >= 0),
  indirect_label text,
  driver_egp     bigint not null default 0,
  profit_egp     bigint not null default 0,     
  owner_egp      bigint not null default 0,
  sharer_egp     bigint not null default 0,
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  submitted_by   uuid not null references people,
  decided_by     uuid references people,
  decided_at     timestamptz,
  reason         text,
  note           text,
  voided_at      timestamptz,
  void_reason    text,
  client_uuid    uuid unique,
  created_at     timestamptz not null default now(),
  constraint cd_has_something  check (revenue_egp + fuel_egp + indirect_egp > 0),
  constraint cd_cost_is_a_cost check (kind = 'day'
                                      or (revenue_egp = 0 and fuel_egp = 0 and indirect_egp > 0)),
  constraint cd_profit_derived check (profit_egp = revenue_egp - fuel_egp - driver_egp - indirect_egp),
  constraint cd_split_exact    check (owner_egp + sharer_egp = profit_egp),
  constraint cd_decided        check ((status = 'pending') = (decided_by is null))
);
create unique index car_days_one_live_report_per_date
  on car_days (family_id, drive_date)
  where kind = 'day' and status <> 'rejected' and voided_at is null;
create index on car_days (family_id, drive_date desc);
create or replace trigger car_days_submitter_in_family before insert or update on car_days
  for each row execute function assert_person_in_family('submitted_by');
create or replace function car_day_shares() returns trigger
language plpgsql set search_path = public as $$
declare
  v_value bigint;
  v_share bigint;
begin
  select car_value_egp, car_share_paid_egp into v_value, v_share
    from families where id = new.family_id;
  if v_value is null or v_share is null then
    raise exception 'this family has not recorded what the car cost and what each owner paid';
  end if;
  new.driver_egp := case when new.kind = 'day'
                         then round((new.revenue_egp - new.fuel_egp) / 3.0)::bigint
                         else 0 end;
  new.profit_egp := new.revenue_egp - new.fuel_egp - new.driver_egp - new.indirect_egp;
  new.owner_egp  := round(new.profit_egp * (v_value - v_share)::numeric / v_value)::bigint;
  new.sharer_egp := new.profit_egp - new.owner_egp;
  return new;
end $$;
create trigger car_days_shares
  before insert or update of kind, revenue_egp, fuel_egp, indirect_egp on car_days
  for each row execute function car_day_shares();
create table car_payouts (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families on delete cascade,
  person_id   uuid not null references people,
  amount_egp  bigint not null check (amount_egp <> 0),
  paid_on     date not null,
  note        text,
  recorded_by uuid not null references people,
  voided_at   timestamptz,
  void_reason text,
  client_uuid uuid unique,
  created_at  timestamptz not null default now()
);
create index on car_payouts (family_id, paid_on desc);
alter table car_days    enable row level security;
alter table car_payouts enable row level security;
create policy car_days_read on car_days for select
  using (my_role(family_id) in ('admin','viewer')
         or submitted_by = (my_person(family_id)).id);
create policy car_payouts_read on car_payouts for select
  using (my_role(family_id) in ('admin','viewer'));
create view car_book as
select f.id                                          as family_id,
       f.car_owner_person                            as owner_person,
       f.car_share_person                            as sharer_person,
       (coalesce(d.owner, 0)  - coalesce(p.owner, 0))::bigint  as owner_owed,
       (coalesce(d.sharer, 0) - coalesce(p.sharer, 0))::bigint as sharer_owed,
       coalesce(d.pending_cash, 0)::bigint           as pending_cash,
       coalesce(d.pending_count, 0)::bigint          as pending_count
  from families f
  left join lateral (
    select sum(owner_egp)  filter (where status = 'approved') as owner,
           sum(sharer_egp) filter (where status = 'approved') as sharer,
           sum(profit_egp) filter (where status = 'pending')  as pending_cash,
           count(*)        filter (where status = 'pending')  as pending_count
      from car_days where family_id = f.id and voided_at is null) d on true
  left join lateral (
    select sum(amount_egp) filter (where person_id = f.car_owner_person) as owner,
           sum(amount_egp) filter (where person_id = f.car_share_person) as sharer
      from car_payouts where family_id = f.id and voided_at is null) p on true
 where my_role(f.id) in ('admin','viewer');
alter view car_book set (security_invoker = on);
create or replace function record_car_day(
  p_family         uuid,
  p_drive_date     date,
  p_revenue        bigint default 0,
  p_fuel           bigint default 0,
  p_indirect       bigint default 0,
  p_indirect_label text   default null,
  p_note           text   default null,
  p_client_uuid    uuid   default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me  people;
  v_day uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'driver' and v_me.role is distinct from 'admin' then
    raise exception 'only the driver or the admin records a car day'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_day from car_days where client_uuid = p_client_uuid;
    if v_day is not null then return v_day; end if;
  end if;
  if p_drive_date is null or p_drive_date > family_today(p_family) then
    raise exception 'that day has not happened yet';
  end if;
  if coalesce(p_revenue, -1) < 0 or coalesce(p_fuel, -1) < 0 or coalesce(p_indirect, -1) < 0 then
    raise exception 'amounts cannot be negative';
  end if;
  if p_revenue + p_fuel + p_indirect = 0 then
    raise exception 'a day needs its revenue or a cost';
  end if;
  insert into car_days (family_id, kind, drive_date, revenue_egp, fuel_egp,
                        indirect_egp, indirect_label, note, status,
                        submitted_by, decided_by, decided_at, client_uuid)
       values (p_family, 'day', p_drive_date, p_revenue, p_fuel,
               p_indirect, nullif(p_indirect_label, ''), nullif(p_note, ''),
               case when v_me.role = 'admin' then 'approved' else 'pending' end,
               v_me.id,
               case when v_me.role = 'admin' then v_me.id end,
               case when v_me.role = 'admin' then now() end,
               p_client_uuid)
    returning id into v_day;
  return v_day;
end $$;
create or replace function record_car_cost(
  p_family      uuid,
  p_date        date,
  p_amount      bigint,
  p_label       text,
  p_note        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me  people;
  v_day uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the admin records a cost for the car'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_day from car_days where client_uuid = p_client_uuid;
    if v_day is not null then return v_day; end if;
  end if;
  if p_date is null or p_date > family_today(p_family) then
    raise exception 'that day has not happened yet';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'a cost is a positive number of piastres';
  end if;
  insert into car_days (family_id, kind, drive_date, indirect_egp, indirect_label,
                        note, status, submitted_by, decided_by, decided_at, client_uuid)
       values (p_family, 'cost', p_date, p_amount, nullif(p_label, ''),
               nullif(p_note, ''), 'approved', v_me.id, v_me.id, now(), p_client_uuid)
    returning id into v_day;
  return v_day;
end $$;
create or replace function decide_car_day(p_day uuid, p_status text, p_reason text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row car_days;
  v_me  people;
begin
  select * into v_row from car_days where id = p_day;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the admin approves a car day'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'a day is approved or rejected, got %', p_status;
  end if;
  update car_days
     set status = p_status, decided_by = v_me.id, decided_at = now(),
         reason = nullif(p_reason, '')
   where id = p_day and status = 'pending' and voided_at is null;
  return found;
end $$;
create or replace function void_car_day(p_day uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row car_days;
  v_me  people;
begin
  select * into v_row from car_days where id = p_day;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the admin voids a car day'
      using errcode = 'insufficient_privilege';
  end if;
  update car_days set voided_at = now(), void_reason = nullif(p_reason, '')
   where id = p_day and voided_at is null;
  return found;
end $$;
create or replace function record_car_payout(
  p_family      uuid,
  p_person      uuid,
  p_amount      bigint,
  p_paid_on     date default null,
  p_note        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me  people;
  v_fam families;
  v_id  uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the admin pays the car''s owners'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_id from car_payouts where client_uuid = p_client_uuid;
    if v_id is not null then return v_id; end if;
  end if;
  select * into v_fam from families where id = p_family;
  if p_person is null or p_person is distinct from v_fam.car_owner_person
                         and p_person is distinct from v_fam.car_share_person then
    raise exception 'that person does not own the car'
      using errcode = 'check_violation';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'a payment needs an amount';
  end if;
  if coalesce(p_paid_on, family_today(p_family)) > family_today(p_family) then
    raise exception 'that day has not happened yet';
  end if;
  insert into car_payouts (family_id, person_id, amount_egp, paid_on, note,
                           recorded_by, client_uuid)
       values (p_family, p_person, p_amount,
               coalesce(p_paid_on, family_today(p_family)), nullif(p_note, ''),
               v_me.id, p_client_uuid)
    returning id into v_id;
  return v_id;
end $$;
create or replace function void_car_payout(p_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row car_payouts;
  v_me  people;
begin
  select * into v_row from car_payouts where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the admin voids a payment'
      using errcode = 'insufficient_privilege';
  end if;
  update car_payouts set voided_at = now(), void_reason = nullif(p_reason, '')
   where id = p_id and voided_at is null;
  return found;
end $$;
`,O=`
create or replace function correct_car_day(
  p_day            uuid,
  p_drive_date     date,
  p_revenue        bigint default 0,
  p_fuel           bigint default 0,
  p_indirect       bigint default 0,
  p_indirect_label text   default null,
  p_note           text   default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_row car_days;
  v_me  people;
  v_new uuid;
begin
  select * into v_row from car_days where id = p_day;
  if v_row.id is null then
    raise exception 'no such car day';
  end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the admin corrects a car day'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then
    raise exception 'that day has already been corrected or removed'
      using errcode = 'check_violation';
  end if;
  if v_row.status = 'rejected' then
    raise exception 'a rejected day is not on the record to correct'
      using errcode = 'check_violation';
  end if;
  if p_drive_date is null or p_drive_date > family_today(v_row.family_id) then
    raise exception 'that day has not happened yet';
  end if;
  if coalesce(p_revenue, -1) < 0 or coalesce(p_fuel, -1) < 0 or coalesce(p_indirect, -1) < 0 then
    raise exception 'amounts cannot be negative';
  end if;
  if v_row.kind = 'cost' and (p_revenue <> 0 or p_fuel <> 0 or p_indirect <= 0) then
    raise exception 'a cost is a positive maintenance amount and nothing else';
  end if;
  if p_revenue + p_fuel + p_indirect = 0 then
    raise exception 'a day needs its revenue or a cost';
  end if;
  update car_days
     set voided_at = now(), void_reason = 'corrected'
   where id = p_day;
  insert into car_days (family_id, kind, drive_date, revenue_egp, fuel_egp,
                        indirect_egp, indirect_label, note, status,
                        submitted_by, decided_by, decided_at)
       values (v_row.family_id, v_row.kind, p_drive_date, p_revenue, p_fuel,
               p_indirect, nullif(p_indirect_label, ''), nullif(p_note, ''),
               v_row.status, v_row.submitted_by, v_row.decided_by, v_row.decided_at)
    returning id into v_new;
  return v_new;
end $$;
`,k=`
drop view if exists member_balances;
drop function if exists pay_allowance(uuid, uuid, date, date, bigint, uuid);
drop function if exists set_allowance_rate(uuid, uuid, bigint, date);
drop function if exists allowance_rate_on(uuid, date);
drop table if exists allowance_rates;
drop index if exists allowances_one_live_payment_per_month;
alter table allowances drop constraint if exists allowances_period_is_month_start;
alter table allowances drop column if exists period;
alter table allowances add column if not exists note text;
alter table allowances add column if not exists created_at timestamptz not null default now();
create index if not exists allowances_by_recipient
  on allowances (recipient_id, paid_on desc, created_at desc);
create or replace function pay_allowance(
  p_family      uuid,
  p_recipient   uuid,
  p_amount      bigint,              
  p_paid_on     date default null,   
  p_note        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me        people;
  v_cat       categories;
  v_cash      uuid;
  v_paid_on   date;
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_journal   uuid;
  v_allowance uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin pays an allowance'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_allowance from allowances where client_uuid = p_client_uuid;
    if v_allowance is not null then return v_allowance; end if;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'an allowance must be a positive number of piastres';
  end if;
  v_paid_on := coalesce(p_paid_on, family_today(p_family));
  if v_paid_on > family_today(p_family) then
    raise exception 'that day has not happened yet';
  end if;
  if not exists (select 1 from people
                  where id = p_recipient and family_id = p_family and active) then
    raise exception 'that person is not in this family'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_cat from categories
   where family_id = p_family and purpose = 'allowance' and active;
  if v_cat.id is null then
    raise exception 'this family has no Allowance category — run the bootstrap';
  end if;
  select id into v_cash from accounts
   where family_id = p_family and system_key = 'cash';
  if v_cash is null then
    raise exception 'this family has no cash account — run the bootstrap';
  end if;
  v_journal := post_journal(
    p_family, v_paid_on, coalesce(v_note, 'allowance'),
    jsonb_build_array(
      jsonb_build_object('account_id', v_cat.account_id, 'amount', p_amount,
                         'category_id', v_cat.id, 'person_id', p_recipient),
      jsonb_build_object('account_id', v_cash, 'amount', -p_amount)),
    'allowances', null, p_client_uuid);
  insert into allowances (family_id, recipient_id, amount_egp, paid_on, paid_by,
                          note, journal_id, client_uuid)
       values (p_family, p_recipient, p_amount, v_paid_on, v_me.id,
               v_note, v_journal, p_client_uuid)
    returning id into v_allowance;
  return v_allowance;
end $$;
create view member_balances as
  with recipients as (
    select family_id, recipient_id as person_id from allowances where voided_at is null
    union
    select family_id, person_id from member_expenses
  ),
  paid as (
    select family_id, recipient_id as person_id,
           sum(amount_egp) as received,
           max(paid_on)    as last_paid_on
      from allowances where voided_at is null
     group by family_id, recipient_id
  ),
  latest as (
    select distinct on (recipient_id)
           recipient_id as person_id, amount_egp as last_amount
      from allowances where voided_at is null
     order by recipient_id, paid_on desc, created_at desc
  ),
  spent as (
    select family_id, person_id,
           coalesce(sum(amount_egp) filter (where status = 'approved'), 0) as approved,
           coalesce(sum(amount_egp) filter (where status = 'pending'),  0) as pending,
           count(*) filter (where status = 'pending')                      as pending_count
      from member_expenses group by family_id, person_id
  )
  select r.family_id,
         r.person_id,
         coalesce(p.received, 0)                            as received,
         coalesce(s.approved, 0)                            as approved,
         coalesce(p.received, 0) - coalesce(s.approved, 0)  as balance,
         coalesce(s.pending, 0)                             as pending,
         coalesce(s.pending_count, 0)                       as pending_count,
         p.last_paid_on,
         l.last_amount
    from recipients r
    left join paid   p on p.family_id = r.family_id and p.person_id = r.person_id
    left join latest l on l.person_id = r.person_id
    left join spent  s on s.family_id = r.family_id and s.person_id = r.person_id;
alter view member_balances set (security_invoker = on);
`,A=`
insert into accounts (family_id, kind, name, system_key)
select f.id, 'equity', 'Opening balance', 'opening_balance'
  from families f
 where not exists (
   select 1 from accounts a
    where a.family_id = f.id and a.system_key = 'opening_balance');
`,j=`
create or replace function void_allowance(p_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row     allowances;
  v_me      people;
  v_journal uuid;
begin
  select * into v_row from allowances where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin voids an allowance'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then return false; end if;
  v_journal := post_journal_as(
    v_row.family_id, v_me.id, family_today(v_row.family_id),
    coalesce(p_reason, 'voided allowance'),
    (select jsonb_agg(jsonb_build_object(
              'account_id', e.account_id, 'amount', -e.amount,
              'person_id',  e.person_id,  'category_id', e.category_id))
       from entries e where e.journal_id = v_row.journal_id),
    'allowances', p_id, null);
  update journals set reverses = v_row.journal_id where id = v_journal;
  update allowances set voided_at = now(), void_reason = p_reason where id = p_id;
  return true;
end $$;
create or replace function void_remittance(p_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row     remittances;
  v_me      people;
  v_journal uuid;
begin
  select * into v_row from remittances where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin voids a remittance'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then return false; end if;
  if v_row.journal_id is not null then
    v_journal := post_journal_as(
      v_row.family_id, v_me.id, current_date,
      coalesce(p_reason, 'voided remittance'),
      (select jsonb_agg(jsonb_build_object(
                'account_id', e.account_id, 'amount', -e.amount,
                'person_id',  e.person_id,  'category_id', e.category_id))
         from entries e where e.journal_id = v_row.journal_id),
      'remittances', p_id, null);
    update journals set reverses = v_row.journal_id where id = v_journal;
  end if;
  update remittances set voided_at = now(), void_reason = p_reason where id = p_id;
  return true;
end $$;
create or replace function void_loan_payment(p_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row     loan_payments;
  v_fam     uuid;
  v_me      people;
  v_journal uuid;
begin
  select * into v_row from loan_payments where id = p_id;
  if v_row.id is null then return false; end if;
  select family_id into v_fam from loans where id = v_row.loan_id;
  v_me := my_person(v_fam);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin voids a repayment'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then return false; end if;
  v_journal := post_journal_as(
    v_fam, v_me.id, family_today(v_fam), coalesce(p_reason, 'voided repayment'),
    (select jsonb_agg(jsonb_build_object(
              'account_id', e.account_id, 'amount', -e.amount,
              'person_id', e.person_id, 'category_id', e.category_id))
       from entries e where e.journal_id = v_row.journal_id),
    'loan_payments', p_id, null);
  update journals set reverses = v_row.journal_id where id = v_journal;
  update loan_payments set voided_at = now(), void_reason = p_reason where id = p_id;
  return true;
end $$;
create or replace function void_loan(p_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row     loans;
  v_me      people;
  v_journal uuid;
begin
  select * into v_row from loans where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin voids a loan'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then return false; end if;
  if exists (select 1 from loan_payments
              where loan_id = p_id and voided_at is null) then
    raise exception 'that loan has repayments against it — void those first';
  end if;
  v_journal := post_journal_as(
    v_row.family_id, v_me.id, family_today(v_row.family_id),
    coalesce(p_reason, 'voided loan'),
    (select jsonb_agg(jsonb_build_object(
              'account_id', e.account_id, 'amount', -e.amount,
              'person_id', e.person_id, 'category_id', e.category_id))
       from entries e where e.journal_id = v_row.journal_id),
    'loans', p_id, null);
  update journals set reverses = v_row.journal_id where id = v_journal;
  update loans set voided_at = now(), void_reason = p_reason where id = p_id;
  return true;
end $$;
update journals j
   set reverses = t.journal_id
  from allowances t
 where j.source_table = 'allowances'
   and j.source_id = t.id
   and t.voided_at is not null
   and j.reverses is null
   and j.id <> t.journal_id;
update journals j
   set reverses = t.journal_id
  from remittances t
 where j.source_table = 'remittances'
   and j.source_id = t.id
   and t.voided_at is not null
   and j.reverses is null
   and j.id <> t.journal_id;
update journals j
   set reverses = t.journal_id
  from loan_payments t
 where j.source_table = 'loan_payments'
   and j.source_id = t.id
   and t.voided_at is not null
   and j.reverses is null
   and j.id <> t.journal_id;
update journals j
   set reverses = t.journal_id
  from loans t
 where j.source_table = 'loans'
   and j.source_id = t.id
   and t.voided_at is not null
   and j.reverses is null
   and j.id <> t.journal_id;
`,M=`
create or replace function assert_allowance_category_protected() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from families where id = old.family_id) then
      return old;
    end if;
    raise exception 'the Allowance category cannot be retired or repurposed'
      using errcode = 'check_violation';
  end if;
  if new.active = false
     or new.purpose is distinct from old.purpose
     or new.kind is distinct from old.kind
     or new.account_id is distinct from old.account_id then
    raise exception 'the Allowance category cannot be retired or repurposed'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create or replace trigger allowance_category_protected
  before update or delete on categories
  for each row
  when (old.purpose = 'allowance')
  execute function assert_allowance_category_protected();
`,N=`
create or replace function decide_member_expense(
  p_id uuid, p_status submission_status, p_reason text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row member_expenses;
  v_me  people;
begin
  select * into v_row from member_expenses where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin decides submissions'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status = 'pending' then
    raise exception 'cannot move a submission back to pending';
  end if;
  if p_status = 'rejected' and coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a rejection needs a reason' using errcode = 'check_violation';
  end if;
  update member_expenses
     set status = p_status, decided_by = v_me.id, decided_at = now(),
         reason = nullif(regexp_replace(p_reason, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '')
   where id = p_id and status = 'pending';
  return found;
end $$;
create or replace function decide_car_day(p_day uuid, p_status text, p_reason text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row car_days;
  v_me  people;
begin
  select * into v_row from car_days where id = p_day;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the admin approves a car day'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'a day is approved or rejected, got %', p_status;
  end if;
  if p_status = 'rejected' and coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a rejection needs a reason' using errcode = 'check_violation';
  end if;
  update car_days
     set status = p_status, decided_by = v_me.id, decided_at = now(),
         reason = nullif(regexp_replace(p_reason, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '')
   where id = p_day and status = 'pending' and voided_at is null;
  return found;
end $$;
`,P=`
create or replace function my_person(p_family uuid)
returns people
language sql stable security definer set search_path = public as $$
  select * from people
   where auth_user_id = auth.uid()
     and family_id    = p_family
     and active
     and (role <> 'admin' or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
   limit 1
$$;
create or replace function my_role(p_family uuid)
returns person_role
language sql stable security definer set search_path = public as $$
  select role from people
   where auth_user_id = auth.uid()
     and family_id    = p_family
     and active
     and (role <> 'admin' or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
   limit 1
$$;
create or replace function needs_second_factor()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from people
     where auth_user_id = auth.uid()
       and active
       and role = 'admin'
       and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
  )
$$;
revoke execute on function needs_second_factor() from public;
revoke execute on function needs_second_factor() from anon;
grant  execute on function needs_second_factor() to authenticated;
`,F=`
alter table people add column if not exists is_operator boolean not null default false;
create or replace function assert_is_operator_service_role_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null or current_user in ('authenticated', 'anon') then
    raise exception 'is_operator can only be set by the service role'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger people_is_operator_service_only_insert
  before insert on people
  for each row
  when (new.is_operator)
  execute function assert_is_operator_service_role_only();
create trigger people_is_operator_service_only_update
  before update on people
  for each row
  when (new.is_operator is distinct from old.is_operator)
  execute function assert_is_operator_service_role_only();
create or replace function operator_accounts(p_family uuid)
returns table (
  person_id          uuid,
  display_name       text,
  role               person_role,
  active             boolean,
  must_set_password  boolean,
  last_sign_in_at    timestamptz,
  email_confirmed    boolean
)
language plpgsql security definer set search_path = public as $$
declare v_me people;
begin
  v_me := my_person(p_family);
  if v_me.id is null or not coalesce(v_me.is_operator, false) then
    raise exception 'not an operator of this family' using errcode = 'insufficient_privilege';
  end if;
  return query
    select p.id, p.display_name, p.role, p.active, p.must_set_password,
           u.last_sign_in_at, u.email_confirmed_at is not null
      from people p
      left join auth.users u on u.id = p.auth_user_id
     where p.family_id = p_family
       and p.auth_user_id is not null    
     order by p.member_no;
end $$;
create or replace function operator_activity(p_family uuid, p_limit int default 100)
returns table (
  at           timestamptz,
  person_id    uuid,
  display_name text,
  action       text,
  subject      text
)
language plpgsql security definer set search_path = public as $$
declare
  v_me      people;
  v_limit   int;
begin
  v_me := my_person(p_family);
  if v_me.id is null or not coalesce(v_me.is_operator, false) then
    raise exception 'not an operator of this family' using errcode = 'insufficient_privilege';
  end if;
  v_limit := greatest(1, least(coalesce(p_limit, 100), 500));
  return query
    select j.recorded_at, j.recorded_by, p.display_name,
           case when j.reverses is null then 'recorded' else 'reversed' end, 'journal'
      from journals j
      join people p on p.id = j.recorded_by
     where j.family_id = p_family
    union all
    select me.created_at, me.person_id, p.display_name, 'submitted', 'submission'
      from member_expenses me
      join people p on p.id = me.person_id
     where me.family_id = p_family
    union all
    select me.decided_at, me.decided_by, p.display_name, me.status::text, 'submission'
      from member_expenses me
      join people p on p.id = me.decided_by
     where me.family_id = p_family and me.decided_by is not null
    union all
    select cd.created_at, cd.submitted_by, p.display_name, 'submitted', 'car day'
      from car_days cd
      join people p on p.id = cd.submitted_by
     where cd.family_id = p_family
    union all
    select cd.decided_at, cd.decided_by, p.display_name, cd.status, 'car day'
      from car_days cd
      join people p on p.id = cd.decided_by
     where cd.family_id = p_family and cd.decided_by is not null
    union all
    select cd.voided_at, null::uuid, null::text, 'voided', 'car day'
      from car_days cd
     where cd.family_id = p_family and cd.voided_at is not null
    union all
    select cp.created_at, cp.recorded_by, p.display_name, 'recorded', 'car payout'
      from car_payouts cp
      join people p on p.id = cp.recorded_by
     where cp.family_id = p_family
    union all
    select cp.voided_at, null::uuid, null::text, 'voided', 'car payout'
      from car_payouts cp
     where cp.family_id = p_family and cp.voided_at is not null
    union all
    select a.created_at, a.paid_by, p.display_name, 'paid', 'allowance'
      from allowances a
      join people p on p.id = a.paid_by
     where a.family_id = p_family
    union all
    select a.voided_at, null::uuid, null::text, 'voided', 'allowance'
      from allowances a
     where a.family_id = p_family and a.voided_at is not null
    union all
    select r.created_at, r.rate_set_by, p.display_name, 'recorded', 'remittance'
      from remittances r
      join people p on p.id = r.rate_set_by
     where r.family_id = p_family
    union all
    select r.voided_at, null::uuid, null::text, 'voided', 'remittance'
      from remittances r
     where r.family_id = p_family and r.voided_at is not null
    union all
    select pc.closed_at, pc.closed_by, p.display_name, 'closed', 'period close'
      from period_closes pc
      join people p on p.id = pc.closed_by
     where pc.family_id = p_family
    union all
    select pp.created_at, pp.id, pp.display_name, 'joined', 'person'
      from people pp
     where pp.family_id = p_family
    order by 1 desc
    limit v_limit;
end $$;
create or replace function operator_health(p_family uuid)
returns table (
  schema_version          text,
  pending_password_count  bigint
)
language plpgsql security definer set search_path = public as $$
declare
  v_me      people;
  v_version text;
  v_count   bigint;
begin
  v_me := my_person(p_family);
  if v_me.id is null or not coalesce(v_me.is_operator, false) then
    raise exception 'not an operator of this family' using errcode = 'insufficient_privilege';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    select max(version) into v_version from supabase_migrations.schema_migrations;
  else
    v_version := null;
  end if;
  select count(*) into v_count from people
   where family_id = p_family and must_set_password;
  return query select v_version, v_count;
end $$;
revoke execute on function operator_accounts(uuid)      from public;
revoke execute on function operator_accounts(uuid)      from anon;
grant  execute on function operator_accounts(uuid)      to authenticated;
revoke execute on function operator_activity(uuid, int) from public;
revoke execute on function operator_activity(uuid, int) from anon;
grant  execute on function operator_activity(uuid, int) to authenticated;
revoke execute on function operator_health(uuid)        from public;
revoke execute on function operator_health(uuid)        from anon;
grant  execute on function operator_health(uuid)        to authenticated;
`,I=`
create table member_books (
  person_id       uuid primary key references people,
  family_id       uuid not null references families on delete cascade,
  started_on      date not null default current_date,
  essentials_pct  int  not null default 50,
  investment_pct  int  not null default 15,
  emergencies_pct int  not null default 5,
  fun_pct         int  not null default 30,
  constraint member_books_pcts_valid check (
    essentials_pct  between 0 and 100 and
    investment_pct  between 0 and 100 and
    emergencies_pct between 0 and 100 and
    fun_pct         between 0 and 100 and
    essentials_pct + investment_pct + emergencies_pct + fun_pct = 100
  )
);
insert into member_books (person_id, family_id, started_on)
select p.id, p.family_id, family_today(p.family_id)
  from people p
 where p.role = 'member' and p.active
on conflict (person_id) do nothing;
create or replace function ensure_member_book() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into member_books (person_id, family_id, started_on)
  values (new.id, new.family_id, family_today(new.family_id))
  on conflict (person_id) do nothing;
  return null;
end $$;
create trigger people_member_gets_a_book
  after insert or update of role, active on people
  for each row
  when (new.role = 'member' and new.active)
  execute function ensure_member_book();
create table member_incomes (
  id          uuid   primary key default gen_random_uuid(),
  family_id   uuid   not null references families on delete cascade,
  person_id   uuid   not null references people,
  amount_egp  bigint not null check (amount_egp > 0),
  received_on date   not null,
  note        text,
  client_uuid uuid   unique,
  created_at  timestamptz not null default now(),
  constraint member_incomes_not_future check (received_on <= current_date)
);
create index on member_incomes (person_id, received_on desc);
create table member_splits (
  id              uuid   primary key default gen_random_uuid(),
  family_id       uuid   not null references families on delete cascade,
  person_id       uuid   not null references people,
  essentials_egp  bigint not null default 0 check (essentials_egp  >= 0),
  investment_egp  bigint not null default 0 check (investment_egp  >= 0),
  emergencies_egp bigint not null default 0 check (emergencies_egp >= 0),
  fun_egp         bigint not null default 0 check (fun_egp         >= 0),
  client_uuid     uuid   unique,
  created_at      timestamptz not null default now(),
  constraint member_splits_not_empty check (
    essentials_egp + investment_egp + emergencies_egp + fun_egp > 0
  )
);
create index on member_splits (person_id, created_at desc);
create table member_payments (
  id          uuid   primary key default gen_random_uuid(),
  family_id   uuid   not null references families on delete cascade,
  person_id   uuid   not null references people,
  pot         text   not null check (pot in ('essentials','investment','emergencies','fun')),
  amount_egp  bigint not null check (amount_egp > 0),
  paid_on     date   not null,
  note        text,
  client_uuid uuid   unique,
  created_at  timestamptz not null default now(),
  constraint member_payments_not_future check (paid_on <= current_date)
);
create index on member_payments (person_id, paid_on desc);
alter table member_books    enable row level security;
alter table member_incomes  enable row level security;
alter table member_splits   enable row level security;
alter table member_payments enable row level security;
create policy member_books_read on member_books for select
  using (person_id = (my_person(family_id)).id);
create policy member_incomes_read on member_incomes for select
  using (person_id = (my_person(family_id)).id);
create policy member_incomes_insert on member_incomes for insert
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = member_incomes.person_id
         and b.family_id = member_incomes.family_id
    )
  );
create policy member_incomes_delete on member_incomes for delete
  using (person_id = (my_person(family_id)).id);
create policy member_splits_read on member_splits for select
  using (person_id = (my_person(family_id)).id);
create policy member_splits_insert on member_splits for insert
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = member_splits.person_id
         and b.family_id = member_splits.family_id
    )
  );
create policy member_splits_delete on member_splits for delete
  using (person_id = (my_person(family_id)).id);
create policy member_payments_read on member_payments for select
  using (person_id = (my_person(family_id)).id);
create policy member_payments_insert on member_payments for insert
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = member_payments.person_id
         and b.family_id = member_payments.family_id
    )
  );
create policy member_payments_delete on member_payments for delete
  using (person_id = (my_person(family_id)).id);
create or replace function my_received(p_family uuid)
returns table (
  occurred_on date,
  amount_egp  bigint,
  kind        text,
  category_en text,
  category_ar text,
  memo        text,
  counted     boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_me   people;
  v_book member_books;
begin
  v_me := my_person(p_family);
  if v_me.id is not null then
    select * into v_book from member_books
     where person_id = v_me.id and family_id = p_family;
  end if;
  if v_me.id is null or v_book.person_id is null then
    raise exception 'not a member with a book in this family'
      using errcode = 'insufficient_privilege';
  end if;
  return query
    select a.paid_on, a.amount_egp, 'allowance'::text,
           ac.name_en, ac.name_ar, a.note,
           a.paid_on >= v_book.started_on
      from allowances a
      join categories ac on ac.family_id = p_family and ac.purpose = 'allowance'
     where a.family_id = p_family
       and a.recipient_id = v_me.id
       and a.voided_at is null
    union all
    select j.occurred_on, e.amount,
           case when c.needs_recipient then 'gift' else 'paid_for_you' end,
           c.name_en, c.name_ar, j.memo,
           c.needs_recipient and j.occurred_on >= v_book.started_on
      from entries e
      join journals   j on j.id = e.journal_id
      join categories c on c.id = e.category_id
     where j.family_id = p_family
       and e.person_id = v_me.id
       and c.kind = 'expense'
       and c.purpose is distinct from 'allowance'
       and j.reverses is null
       and not exists (select 1 from journals r where r.reverses = j.id)
    order by 1 desc;
end $$;
create or replace function my_budget(p_family uuid)
returns table (
  started_on      date,
  received_egp    bigint,
  incomes_egp     bigint,
  split_egp       bigint,
  unsplit_egp     bigint,
  essentials_egp  bigint,
  investment_egp  bigint,
  emergencies_egp bigint,
  fun_egp         bigint,
  essentials_pct  int,
  investment_pct  int,
  emergencies_pct int,
  fun_pct         int
)
language plpgsql security definer set search_path = public as $$
declare
  v_me                people;
  v_book              member_books;
  v_received_egp      bigint;
  v_incomes_egp       bigint;
  v_split_essentials  bigint;
  v_split_investment  bigint;
  v_split_emergencies bigint;
  v_split_fun         bigint;
  v_paid_essentials   bigint;
  v_paid_investment   bigint;
  v_paid_emergencies  bigint;
  v_paid_fun          bigint;
begin
  v_me := my_person(p_family);
  if v_me.id is not null then
    select * into v_book from member_books
     where person_id = v_me.id and family_id = p_family;
  end if;
  if v_me.id is null or v_book.person_id is null then
    raise exception 'not a member with a book in this family'
      using errcode = 'insufficient_privilege';
  end if;
  select coalesce(sum(r.amount_egp) filter (where r.counted), 0)
    into v_received_egp
    from my_received(p_family) r;
  select coalesce(sum(amount_egp), 0) into v_incomes_egp
    from member_incomes where person_id = v_me.id and family_id = p_family;
  select coalesce(sum(s.essentials_egp), 0), coalesce(sum(s.investment_egp), 0),
         coalesce(sum(s.emergencies_egp), 0), coalesce(sum(s.fun_egp), 0)
    into v_split_essentials, v_split_investment, v_split_emergencies, v_split_fun
    from member_splits s where s.person_id = v_me.id and s.family_id = p_family;
  select coalesce(sum(p.amount_egp) filter (where p.pot = 'essentials'), 0),
         coalesce(sum(p.amount_egp) filter (where p.pot = 'investment'), 0),
         coalesce(sum(p.amount_egp) filter (where p.pot = 'emergencies'), 0),
         coalesce(sum(p.amount_egp) filter (where p.pot = 'fun'), 0)
    into v_paid_essentials, v_paid_investment, v_paid_emergencies, v_paid_fun
    from member_payments p where p.person_id = v_me.id and p.family_id = p_family;
  return query select
    v_book.started_on,
    v_received_egp,
    v_incomes_egp,
    v_split_essentials + v_split_investment + v_split_emergencies + v_split_fun,
    (v_received_egp + v_incomes_egp)
      - (v_split_essentials + v_split_investment + v_split_emergencies + v_split_fun),
    v_split_essentials  - v_paid_essentials,
    v_split_investment  - v_paid_investment,
    v_split_emergencies - v_paid_emergencies,
    v_split_fun         - v_paid_fun,
    v_book.essentials_pct,
    v_book.investment_pct,
    v_book.emergencies_pct,
    v_book.fun_pct;
end $$;
revoke execute on function my_received(uuid) from public;
revoke execute on function my_received(uuid) from anon;
grant  execute on function my_received(uuid) to authenticated;
revoke execute on function my_budget(uuid) from public;
revoke execute on function my_budget(uuid) from anon;
grant  execute on function my_budget(uuid) to authenticated;
drop policy if exists me_insert on member_expenses;
`,L=`
create or replace function my_person(p_family uuid)
returns people
language sql stable security definer set search_path = public as $$
  select * from people
   where auth_user_id = auth.uid()
     and family_id    = p_family
     and active
   limit 1
$$;
create or replace function my_role(p_family uuid)
returns person_role
language sql stable security definer set search_path = public as $$
  select role from people
   where auth_user_id = auth.uid()
     and family_id    = p_family
     and active
   limit 1
$$;
create or replace function needs_second_factor()
returns boolean
language sql stable security definer set search_path = public as $$
  select false
$$;
`,R=`
create table member_debts (
  id          uuid        primary key default gen_random_uuid(),
  family_id   uuid        not null references families on delete cascade,
  person_id   uuid        not null references people,
  owed_to     text        not null,
  amount_egp  bigint      not null check (amount_egp > 0),
  borrowed_on date        not null default current_date,
  note        text,
  client_uuid uuid        unique,
  created_at  timestamptz not null default now(),
  unique (id, person_id),
  constraint member_debts_owed_to_length check (
    char_length(regexp_replace(owed_to,
      '^[[:space:]\\u200B\\u200C\\u200D\\uFEFF]+|[[:space:]\\u200B\\u200C\\u200D\\uFEFF]+$', '', 'g'))
      between 1 and 60
  ),
  constraint member_debts_not_future check (borrowed_on <= current_date)
);
create index on member_debts (person_id);
alter table member_debts enable row level security;
create policy member_debts_read on member_debts for select
  using (person_id = (my_person(family_id)).id);
create policy member_debts_insert on member_debts for insert
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = member_debts.person_id
         and b.family_id = member_debts.family_id
    )
  );
create policy member_debts_delete on member_debts for delete
  using (person_id = (my_person(family_id)).id);
alter table member_payments add column debt_id uuid null;
alter table member_payments
  add constraint member_payments_debt_fk
  foreign key (debt_id, person_id) references member_debts (id, person_id)
    on delete set null (debt_id);
create index on member_payments (debt_id);
`,z=`
create policy member_books_update on member_books for update
  using      (person_id = (my_person(family_id)).id)
  with check (person_id = (my_person(family_id)).id);
revoke update on member_books from authenticated, anon;
grant  update (essentials_pct, investment_pct, emergencies_pct, fun_pct)
  on member_books to authenticated;
create policy member_incomes_update on member_incomes for update
  using      (person_id = (my_person(family_id)).id)
  with check (person_id = (my_person(family_id)).id);
revoke update on member_incomes from authenticated, anon;
grant  update (amount_egp, received_on, note) on member_incomes to authenticated;
create policy member_splits_update on member_splits for update
  using      (person_id = (my_person(family_id)).id)
  with check (person_id = (my_person(family_id)).id);
revoke update on member_splits from authenticated, anon;
grant  update (essentials_egp, investment_egp, emergencies_egp, fun_egp)
  on member_splits to authenticated;
create or replace function member_splits_total_unchanged() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.essentials_egp + new.investment_egp + new.emergencies_egp + new.fun_egp)
     is distinct from
     (old.essentials_egp + old.investment_egp + old.emergencies_egp + old.fun_egp)
  then
    raise exception 'a split keeps its total' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger member_splits_keep_total
  before update on member_splits
  for each row execute function member_splits_total_unchanged();
create policy member_payments_update on member_payments for update
  using      (person_id = (my_person(family_id)).id)
  with check (person_id = (my_person(family_id)).id);
revoke update on member_payments from authenticated, anon;
grant  update (pot, amount_egp, paid_on, note, debt_id) on member_payments to authenticated;
create policy member_debts_update on member_debts for update
  using      (person_id = (my_person(family_id)).id)
  with check (person_id = (my_person(family_id)).id);
revoke update on member_debts from authenticated, anon;
grant  update (owed_to, amount_egp, borrowed_on, note) on member_debts to authenticated;
`,B=`
alter table member_debts add column if not exists direction text
  not null default 'i_owe';
alter table member_debts
  add constraint member_debts_direction_valid
  check (direction in ('i_owe','owed_to_me'));
alter table member_incomes add column if not exists debt_id uuid null;
alter table member_incomes
  add constraint member_incomes_debt_fk
  foreign key (debt_id, person_id) references member_debts (id, person_id)
    on delete set null (debt_id);
create index on member_incomes (debt_id);
grant update (debt_id) on member_incomes to authenticated;
`,V=`
do $$
begin
  if exists (select 1 from member_expenses limit 1) then
    raise exception
      'member_expenses is not empty — refusing to drop it. Live was '
      'checked at 0 rows on 15 September 2026; if a row exists now, this '
      'migration needs to be re-examined before it runs any further.'
      using errcode = 'check_violation';
  end if;
end $$;
drop view if exists member_balances;
create view member_balances as
  with recipients as (
    select distinct family_id, recipient_id as person_id
      from allowances where voided_at is null
  ),
  paid as (
    select family_id, recipient_id as person_id,
           sum(amount_egp) as received,
           max(paid_on)    as last_paid_on
      from allowances where voided_at is null
     group by family_id, recipient_id
  ),
  latest as (
    select distinct on (recipient_id)
           recipient_id as person_id, amount_egp as last_amount
      from allowances where voided_at is null
     order by recipient_id, paid_on desc, created_at desc
  )
  select r.family_id,
         r.person_id,
         coalesce(p.received, 0)  as received,
         p.last_paid_on,
         l.last_amount
    from recipients r
    left join paid   p on p.family_id = r.family_id and p.person_id = r.person_id
    left join latest l on l.person_id = r.person_id;
alter view member_balances set (security_invoker = on);
create or replace function operator_activity(p_family uuid, p_limit int default 100)
returns table (
  at           timestamptz,
  person_id    uuid,
  display_name text,
  action       text,
  subject      text
)
language plpgsql security definer set search_path = public as $$
declare
  v_me      people;
  v_limit   int;
begin
  v_me := my_person(p_family);
  if v_me.id is null or not coalesce(v_me.is_operator, false) then
    raise exception 'not an operator of this family' using errcode = 'insufficient_privilege';
  end if;
  v_limit := greatest(1, least(coalesce(p_limit, 100), 500));
  return query
    select j.recorded_at, j.recorded_by, p.display_name,
           case when j.reverses is null then 'recorded' else 'reversed' end, 'journal'
      from journals j
      join people p on p.id = j.recorded_by
     where j.family_id = p_family
    union all
    select cd.created_at, cd.submitted_by, p.display_name, 'submitted', 'car day'
      from car_days cd
      join people p on p.id = cd.submitted_by
     where cd.family_id = p_family
    union all
    select cd.decided_at, cd.decided_by, p.display_name, cd.status, 'car day'
      from car_days cd
      join people p on p.id = cd.decided_by
     where cd.family_id = p_family and cd.decided_by is not null
    union all
    select cd.voided_at, null::uuid, null::text, 'voided', 'car day'
      from car_days cd
     where cd.family_id = p_family and cd.voided_at is not null
    union all
    select cp.created_at, cp.recorded_by, p.display_name, 'recorded', 'car payout'
      from car_payouts cp
      join people p on p.id = cp.recorded_by
     where cp.family_id = p_family
    union all
    select cp.voided_at, null::uuid, null::text, 'voided', 'car payout'
      from car_payouts cp
     where cp.family_id = p_family and cp.voided_at is not null
    union all
    select a.created_at, a.paid_by, p.display_name, 'paid', 'allowance'
      from allowances a
      join people p on p.id = a.paid_by
     where a.family_id = p_family
    union all
    select a.voided_at, null::uuid, null::text, 'voided', 'allowance'
      from allowances a
     where a.family_id = p_family and a.voided_at is not null
    union all
    select r.created_at, r.rate_set_by, p.display_name, 'recorded', 'remittance'
      from remittances r
      join people p on p.id = r.rate_set_by
     where r.family_id = p_family
    union all
    select r.voided_at, null::uuid, null::text, 'voided', 'remittance'
      from remittances r
     where r.family_id = p_family and r.voided_at is not null
    union all
    select pc.closed_at, pc.closed_by, p.display_name, 'closed', 'period close'
      from period_closes pc
      join people p on p.id = pc.closed_by
     where pc.family_id = p_family
    union all
    select pp.created_at, pp.id, pp.display_name, 'joined', 'person'
      from people pp
     where pp.family_id = p_family
    order by 1 desc
    limit v_limit;
end $$;
drop function if exists decide_member_expense(uuid, submission_status, text);
drop table member_expenses;
drop type submission_status;
drop function assert_category_in_family();
`,H=`
alter table people add column if not exists client_uuid uuid null;
alter table people
  add constraint people_client_uuid_key unique (client_uuid);
`,U=`
create or replace function cash_in_hand_on(p_family uuid, p_on date)
returns bigint
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(e.amount), 0)::bigint
    from public.entries   e
    join public.journals  j on j.id = e.journal_id
    join public.accounts  a on a.id = e.account_id
   where a.family_id     = p_family
     and a.system_key    = 'cash'
     and j.family_id     = p_family
     and j.occurred_on  <= p_on
$$;
create or replace function cash_in_hand_between(p_family uuid, p_from date, p_to date)
returns table (starts_on bigint, ends_on bigint)
language sql stable security invoker set search_path = '' as $$
  select public.cash_in_hand_on(p_family, p_from),
         public.cash_in_hand_on(p_family, p_to)
$$;
revoke execute on function cash_in_hand_on(uuid, date) from public, anon;
revoke execute on function cash_in_hand_between(uuid, date, date) from public, anon;
grant  execute on function cash_in_hand_on(uuid, date) to authenticated;
grant  execute on function cash_in_hand_between(uuid, date, date) to authenticated;
`,W=`
create or replace function reverse_journal(p_journal uuid, p_memo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src     journals;
  v_me      people;
  v_journal uuid;
begin
  select * into v_src from journals where id = p_journal;
  if v_src.id is null then
    raise exception 'no such journal' using errcode = 'insufficient_privilege';
  end if;
  v_me := my_person(v_src.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin reverses a journal'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from journals where reverses = p_journal) then
    raise exception 'that entry has already been corrected'
      using errcode = 'check_violation';
  end if;
  insert into journals (family_id, occurred_on, recorded_by, memo, reverses)
       values (v_src.family_id, v_src.occurred_on, v_me.id,
               coalesce(p_memo, 'reversal'), p_journal)
    returning id into v_journal;
  insert into entries (journal_id, account_id, amount, person_id, category_id)
  select v_journal, account_id, -amount, person_id, category_id
    from entries where journal_id = p_journal;
  return v_journal;
end $$;
create or replace function reversal_takes_its_day()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reverses is not null then
    select occurred_on into new.occurred_on from journals where id = new.reverses;
  end if;
  return new;
end $$;
drop trigger if exists journals_reversal_takes_its_day on journals;
create trigger journals_reversal_takes_its_day
  before insert or update of reverses on journals
  for each row execute function reversal_takes_its_day();
update journals rev
   set occurred_on = orig.occurred_on
  from journals orig
 where orig.id = rev.reverses
   and rev.occurred_on <> orig.occurred_on;
create or replace function cash_in_hand_by_month(p_family uuid, p_from date, p_to date)
returns table (month date, first_day date, last_day date, before_first bigint, after_last bigint)
language sql stable security invoker set search_path = '' as $$
  select m::date,
         greatest(m::date, p_from),
         least((m + interval '1 month - 1 day')::date, p_to),
         public.cash_in_hand_on(p_family, greatest(m::date, p_from) - 1),
         public.cash_in_hand_on(p_family, least((m + interval '1 month - 1 day')::date, p_to))
    from generate_series(date_trunc('month', p_from::timestamp),
                         date_trunc('month', p_to::timestamp),
                         interval '1 month') as m
   where p_from <= p_to
   limit 121
$$;
revoke execute on function cash_in_hand_by_month(uuid, date, date) from public, anon;
grant  execute on function cash_in_hand_by_month(uuid, date, date) to authenticated;
`,G=`
alter table categories drop constraint if exists categories_purpose_check;
alter table categories add constraint categories_purpose_check
  check (purpose is null or purpose in ('allowance', 'from_car'));
update categories
   set purpose = 'from_car'
 where purpose is null
   and kind = 'income'
   and name_en = 'From the car';
create or replace function admin_money_lines(p_family uuid, p_from date, p_to date)
returns table (
  line_id       uuid,
  journal_id    uuid,
  occurred_on   date,
  recorded_at   timestamptz,
  source_table  text,
  memo          text,
  direction     text,
  grp           text,
  category_id   uuid,
  person_id     uuid,
  amount        bigint,
  balance_after bigint
)
language sql stable security invoker set search_path = '' as $$
  with counted as (
    select j.id, j.occurred_on, j.recorded_at, j.source_table, j.memo
      from public.journals j
     where j.family_id = p_family
       and j.occurred_on between p_from and p_to
       and j.reverses is null
       and not exists (select 1 from public.journals r where r.reverses = j.id)
       and exists (select 1
                     from public.entries  ce
                     join public.accounts ca on ca.id = ce.account_id
                    where ce.journal_id = j.id
                      and ca.system_key = 'cash')
  ),
  lines as (
    select e.id as line_id, c.id as journal_id, c.occurred_on, c.recorded_at,
           c.source_table, c.memo, -e.amount as cash,
           a.kind, a.system_key, cat.purpose, e.category_id, e.person_id
      from counted c
      join public.entries  e on e.journal_id = c.id
      join public.accounts a on a.id = e.account_id
      left join public.categories cat on cat.id = e.category_id
     where a.system_key is distinct from 'cash'
  ),
  grouped as (
    select l.*,
           case
             when l.system_key = 'opening_balance'   then 'opening'
             when l.system_key = 'remittance_income' then 'remittances'
             when l.kind = 'income' and l.purpose = 'from_car' then 'from_car'
             when l.kind = 'income'                  then 'other_income'
             when l.kind = 'expense'                 then 'spending'
             when l.system_key = 'loan_liability'
               then case when l.cash > 0 then 'loan_taken' else 'loan_we_repaid' end
             when l.system_key = 'loan_receivable'
               then case when l.cash > 0 then 'loan_repaid_to_us' else 'money_we_lent' end
             else case when l.cash > 0 then 'other_in' else 'other_out' end
           end as grp
      from lines l
  ),
  before_range as (
    select public.cash_in_hand_on(p_family, p_from - 1) as cash
  )
  select g.line_id, g.journal_id, g.occurred_on, g.recorded_at, g.source_table, g.memo,
         case when g.grp in ('spending', 'loan_we_repaid', 'money_we_lent', 'other_out')
              then 'out' else 'in' end,
         g.grp, g.category_id, g.person_id,
         (case when g.grp in ('spending', 'loan_we_repaid', 'money_we_lent', 'other_out')
               then -g.cash else g.cash end)::bigint,
         (b.cash + sum(g.cash) over (order by g.occurred_on, g.recorded_at, g.line_id
                                     rows between unbounded preceding and current row))::bigint
    from grouped g
   cross join before_range b
   where p_from <= p_to
   order by g.occurred_on, g.recorded_at, g.line_id
$$;
revoke execute on function admin_money_lines(uuid, date, date) from public, anon;
grant  execute on function admin_money_lines(uuid, date, date) to authenticated;
`,K=`
create index if not exists journals_reverses_idx
  on journals (reverses) where reverses is not null;
create or replace function admin_money_lines(p_family uuid, p_from date, p_to date)
returns table (
  line_id       uuid,
  journal_id    uuid,
  occurred_on   date,
  recorded_at   timestamptz,
  source_table  text,
  memo          text,
  direction     text,
  grp           text,
  category_id   uuid,
  person_id     uuid,
  amount        bigint,
  balance_after bigint
)
language sql stable security definer set search_path = '' as $$
  with counted as (
    select j.id, j.occurred_on, j.recorded_at, j.source_table, j.memo
      from public.journals j
     where j.family_id = p_family
       and j.occurred_on between p_from and p_to
       and j.reverses is null
       and not exists (select 1 from public.journals r where r.reverses = j.id)
       and exists (select 1
                     from public.entries  ce
                     join public.accounts ca on ca.id = ce.account_id
                    where ce.journal_id = j.id
                      and ca.system_key = 'cash')
  ),
  lines as (
    select e.id as line_id, c.id as journal_id, c.occurred_on, c.recorded_at,
           c.source_table, c.memo, -e.amount as cash,
           a.kind, a.system_key, cat.purpose, e.category_id, e.person_id
      from counted c
      join public.entries  e on e.journal_id = c.id
      join public.accounts a on a.id = e.account_id
      left join public.categories cat on cat.id = e.category_id
     where a.system_key is distinct from 'cash'
  ),
  grouped as (
    select l.*,
           case
             when l.system_key = 'opening_balance'   then 'opening'
             when l.system_key = 'remittance_income' then 'remittances'
             when l.kind = 'income' and l.purpose = 'from_car' then 'from_car'
             when l.kind = 'income'                  then 'other_income'
             when l.kind = 'expense'                 then 'spending'
             when l.system_key = 'loan_liability'
               then case when l.cash > 0 then 'loan_taken' else 'loan_we_repaid' end
             when l.system_key = 'loan_receivable'
               then case when l.cash > 0 then 'loan_repaid_to_us' else 'money_we_lent' end
             else case when l.cash > 0 then 'other_in' else 'other_out' end
           end as grp
      from lines l
  ),
  before_range as materialized (
    select public.cash_in_hand_on(p_family, p_from - 1) as cash
  )
  select g.line_id, g.journal_id, g.occurred_on, g.recorded_at, g.source_table, g.memo,
         case when g.grp in ('spending', 'loan_we_repaid', 'money_we_lent', 'other_out')
              then 'out' else 'in' end,
         g.grp, g.category_id, g.person_id,
         (case when g.grp in ('spending', 'loan_we_repaid', 'money_we_lent', 'other_out')
               then -g.cash else g.cash end)::bigint,
         (b.cash + sum(g.cash) over (order by g.occurred_on, g.recorded_at, g.line_id
                                     rows between unbounded preceding and current row))::bigint
    from grouped g
   cross join before_range b
   where p_from <= p_to
     and public.my_role(p_family) in ('admin', 'viewer')
   order by g.occurred_on, g.recorded_at, g.line_id
$$;
`,q=`
drop function if exists void_loan(uuid, text);
create or replace function void_loan(p_id uuid, p_reason text, p_with_payments boolean default false)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_row     loans;
  v_me      people;
  v_journal uuid;
  v_pay     loan_payments;
begin
  select * into v_row from loans where id = p_id;
  if v_row.id is null then return false; end if;
  v_me := my_person(v_row.family_id);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the family admin voids a loan'
      using errcode = 'insufficient_privilege';
  end if;
  if v_row.voided_at is not null then return false; end if;
  if p_with_payments then
    for v_pay in
      select * from loan_payments where loan_id = p_id and voided_at is null
    loop
      perform void_loan_payment(v_pay.id, p_reason);
    end loop;
  elsif exists (select 1 from loan_payments
                 where loan_id = p_id and voided_at is null) then
    raise exception 'that loan has repayments against it — void those first';
  end if;
  v_journal := post_journal_as(
    v_row.family_id, v_me.id, family_today(v_row.family_id),
    coalesce(p_reason, 'voided loan'),
    (select jsonb_agg(jsonb_build_object(
              'account_id', e.account_id, 'amount', -e.amount,
              'person_id', e.person_id, 'category_id', e.category_id))
       from entries e where e.journal_id = v_row.journal_id),
    'loans', p_id, null);
  update journals set reverses = v_row.journal_id where id = v_journal;
  update loans set voided_at = now(), void_reason = p_reason where id = p_id;
  return true;
end $$;
`,J=`
alter table member_books add column model text not null default 'pots';
alter table member_books
  add constraint member_books_model_valid check (model in ('pots','flat'));
alter table member_payments add column category text null;
alter table member_payments
  add constraint member_payments_category_valid check (
    category is null or category in (
      'food','transport','phone','going_out','clothes','gifts','health','study','other','saved','debt'));
alter table member_payments alter column pot drop not null;
alter table member_payments drop constraint if exists member_payments_pot_check;
alter table member_payments
  add constraint member_payments_pot_valid check (
    pot is null or pot in ('essentials','investment','emergencies','fun'));
alter table member_incomes add column from_saved boolean not null default false;
drop policy member_payments_insert on member_payments;
create policy member_payments_insert on member_payments for insert
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = member_payments.person_id
         and b.family_id = member_payments.family_id
         and (   (b.model = 'pots' and member_payments.pot is not null and member_payments.category is null)
              or (b.model = 'flat' and member_payments.pot is null     and member_payments.category is not null))
    )
  );
drop policy member_payments_update on member_payments;
create policy member_payments_update on member_payments for update
  using      (person_id = (my_person(family_id)).id)
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = member_payments.person_id
         and b.family_id = member_payments.family_id
         and (   (b.model = 'pots' and member_payments.pot is not null and member_payments.category is null)
              or (b.model = 'flat' and member_payments.pot is null     and member_payments.category is not null))
    )
  );
drop policy member_incomes_insert on member_incomes;
create policy member_incomes_insert on member_incomes for insert
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = member_incomes.person_id
         and b.family_id = member_incomes.family_id
         and (not member_incomes.from_saved or b.model = 'flat')
    )
  );
drop policy member_incomes_update on member_incomes;
create policy member_incomes_update on member_incomes for update
  using      (person_id = (my_person(family_id)).id)
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = member_incomes.person_id
         and b.family_id = member_incomes.family_id
         and (not member_incomes.from_saved or b.model = 'flat')
    )
  );
grant update (category)   on member_payments to authenticated;
grant update (from_saved) on member_incomes  to authenticated;
create or replace function my_book(p_family uuid)
returns table (
  started_on     date,
  received_egp   bigint,
  incomes_egp    bigint,
  spent_egp      bigint,
  saved_egp      bigint,
  taken_back_egp bigint,
  in_hand_egp    bigint,
  put_away_egp   bigint
)
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_book     member_books;
  v_received bigint;
  v_incomes  bigint;
  v_back     bigint;
  v_spent    bigint;
  v_saved    bigint;
begin
  v_me := my_person(p_family);
  if v_me.id is not null then
    select * into v_book from member_books
     where person_id = v_me.id and family_id = p_family;
  end if;
  if v_me.id is null or v_book.person_id is null or v_book.model <> 'flat' then
    raise exception 'not a member with a flat book in this family'
      using errcode = 'insufficient_privilege';
  end if;
  select coalesce(sum(r.amount_egp) filter (where r.counted), 0)
    into v_received
    from my_received(p_family) r;
  select coalesce(sum(i.amount_egp), 0),
         coalesce(sum(i.amount_egp) filter (where i.from_saved), 0)
    into v_incomes, v_back
    from member_incomes i
   where i.person_id = v_me.id and i.family_id = p_family;
  select coalesce(sum(p.amount_egp), 0),
         coalesce(sum(p.amount_egp) filter (where p.category = 'saved'), 0)
    into v_spent, v_saved
    from member_payments p
   where p.person_id = v_me.id and p.family_id = p_family;
  return query select
    v_book.started_on,
    v_received,
    v_incomes,
    v_spent,
    v_saved,
    v_back,
    v_received + v_incomes - v_spent,
    v_saved - v_back;
end $$;
revoke execute on function my_book(uuid) from public;
revoke execute on function my_book(uuid) from anon;
grant  execute on function my_book(uuid) to authenticated;
create or replace function flip_book_to_flat(p_person uuid)
returns table (became_saved bigint, became_other bigint, became_debt bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_book  member_books;
  v_saved bigint;
  v_other bigint;
  v_debt  bigint;
begin
  select * into v_book from member_books where person_id = p_person;
  if v_book.person_id is null then
    raise exception 'no book for person %', p_person;
  end if;
  if v_book.model = 'flat' then
    raise exception 'that book is already flat';
  end if;
  update member_books set model = 'flat' where person_id = p_person;
  with moved as (
    update member_payments
       set category = case
             when debt_id is not null then 'debt'
             when pot in ('investment','emergencies') then 'saved'
             else 'other'
           end,
           pot = null
     where person_id = p_person and pot is not null
    returning category
  )
  select count(*) filter (where moved.category = 'saved'),
         count(*) filter (where moved.category = 'other'),
         count(*) filter (where moved.category = 'debt')
    into v_saved, v_other, v_debt
    from moved;
  return query select v_saved, v_other, v_debt;
end $$;
revoke execute on function flip_book_to_flat(uuid) from public;
revoke execute on function flip_book_to_flat(uuid) from anon;
revoke execute on function flip_book_to_flat(uuid) from authenticated;
`,Y=`
alter table member_books
  add column plan_save_pct   smallint null,
  add column plan_started_on date     null,
  add column plan_next_on    date     null,
  add column plan_next_for   date     null,
  add column day_closed_on   date     null;
alter table member_books
  add constraint member_books_plan_save_pct_valid
    check (plan_save_pct is null or plan_save_pct between 0 and 100),
  add constraint member_books_day_closed_not_future
    check (day_closed_on is null or day_closed_on <= current_date),
  add constraint member_books_plan_next_pair
    check ((plan_next_on is null) = (plan_next_for is null));
drop policy member_books_update on member_books;
create policy member_books_update on member_books for update
  using      (person_id = (my_person(family_id)).id)
  with check (
    person_id = (my_person(family_id)).id
    and (   model = 'flat'
         or (    plan_save_pct is null and plan_next_on is null
             and plan_next_for is null and day_closed_on is null))
  );
grant update (plan_save_pct, plan_next_on, plan_next_for, day_closed_on)
  on member_books to authenticated;
create table member_recounts (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null references families(id),
  person_id            uuid not null references people(id),
  counted_on           date not null,
  in_hand_counted_egp  bigint not null check (in_hand_counted_egp >= 0),
  put_away_counted_egp bigint not null check (put_away_counted_egp >= 0),
  in_hand_diff_egp     bigint not null,
  put_away_diff_egp    bigint not null,
  client_uuid          uuid not null unique,
  created_at           timestamptz not null default now()
);
create index member_recounts_person on member_recounts (person_id, created_at);
alter table member_recounts enable row level security;
create policy member_recounts_read on member_recounts for select
  using (person_id = (my_person(family_id)).id);
revoke insert, update, delete on member_recounts from authenticated, anon;
create table member_plan_limits (
  family_id    uuid not null references families(id),
  person_id    uuid not null references people(id),
  category     text not null check (category in (
                 'food','transport','phone','going_out','clothes','gifts','health','study','other')),
  per_week_egp bigint not null check (per_week_egp > 0),
  primary key (person_id, category)
);
alter table member_plan_limits enable row level security;
create policy member_plan_limits_read on member_plan_limits for select
  using (person_id = (my_person(family_id)).id);
create policy member_plan_limits_insert on member_plan_limits for insert
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = member_plan_limits.person_id
         and b.family_id = member_plan_limits.family_id
         and b.model = 'flat')
  );
create policy member_plan_limits_update on member_plan_limits for update
  using      (person_id = (my_person(family_id)).id)
  with check (person_id = (my_person(family_id)).id);
create policy member_plan_limits_delete on member_plan_limits for delete
  using (person_id = (my_person(family_id)).id);
revoke update on member_plan_limits from authenticated, anon;
grant  update (per_week_egp) on member_plan_limits to authenticated;
drop function my_book(uuid);
create function my_book(p_family uuid)
returns table (
  started_on             date,
  received_egp           bigint,
  incomes_egp            bigint,
  spent_egp              bigint,
  saved_egp              bigint,
  taken_back_egp         bigint,
  in_hand_egp            bigint,
  put_away_egp           bigint,
  in_hand_recounted_egp  bigint,
  put_away_recounted_egp bigint
)
language plpgsql security definer set search_path = public as $$
declare
  v_me       people;
  v_book     member_books;
  v_received bigint;
  v_incomes  bigint;
  v_back     bigint;
  v_spent    bigint;
  v_saved    bigint;
  v_r_hand   bigint;
  v_r_away   bigint;
begin
  v_me := my_person(p_family);
  if v_me.id is not null then
    select * into v_book from member_books
     where person_id = v_me.id and family_id = p_family;
  end if;
  if v_me.id is null or v_book.person_id is null or v_book.model <> 'flat' then
    raise exception 'not a member with a flat book in this family'
      using errcode = 'insufficient_privilege';
  end if;
  select coalesce(sum(r.amount_egp) filter (where r.counted), 0)
    into v_received
    from my_received(p_family) r;
  select coalesce(sum(i.amount_egp), 0),
         coalesce(sum(i.amount_egp) filter (where i.from_saved), 0)
    into v_incomes, v_back
    from member_incomes i
   where i.person_id = v_me.id and i.family_id = p_family;
  select coalesce(sum(p.amount_egp), 0),
         coalesce(sum(p.amount_egp) filter (where p.category = 'saved'), 0)
    into v_spent, v_saved
    from member_payments p
   where p.person_id = v_me.id and p.family_id = p_family;
  select coalesce(sum(c.in_hand_diff_egp), 0), coalesce(sum(c.put_away_diff_egp), 0)
    into v_r_hand, v_r_away
    from member_recounts c
   where c.person_id = v_me.id and c.family_id = p_family;
  return query select
    v_book.started_on,
    v_received,
    v_incomes,
    v_spent,
    v_saved,
    v_back,
    v_received + v_incomes - v_spent + v_r_hand,
    v_saved - v_back + v_r_away,
    v_r_hand,
    v_r_away;
end $$;
revoke execute on function my_book(uuid) from public;
revoke execute on function my_book(uuid) from anon;
grant  execute on function my_book(uuid) to authenticated;
create function recount_book(p_family uuid, p_in_hand bigint, p_put_away bigint, p_client_uuid uuid)
returns member_recounts
language plpgsql security definer set search_path = public as $$
declare
  v_me   people;
  v_book member_books;
  v_hand bigint;
  v_away bigint;
  v_row  member_recounts;
begin
  v_me := my_person(p_family);
  if v_me.id is not null then
    select * into v_book from member_books
     where person_id = v_me.id and family_id = p_family;
  end if;
  if v_me.id is null or v_book.person_id is null or v_book.model <> 'flat' then
    raise exception 'not a member with a flat book in this family'
      using errcode = 'insufficient_privilege';
  end if;
  if p_in_hand is null or p_in_hand < 0 or p_put_away is null or p_put_away < 0 then
    raise exception 'a count is zero or more' using errcode = 'check_violation';
  end if;
  select * into v_row from member_recounts
   where client_uuid = p_client_uuid and person_id = v_me.id;
  if v_row.id is not null then
    return v_row;
  end if;
  perform 1 from member_books where person_id = v_me.id for update;
  select b.in_hand_egp, b.put_away_egp into v_hand, v_away from my_book(p_family) b;
  insert into member_recounts (family_id, person_id, counted_on,
                               in_hand_counted_egp, put_away_counted_egp,
                               in_hand_diff_egp, put_away_diff_egp, client_uuid)
  values (p_family, v_me.id, family_today(p_family),
          p_in_hand, p_put_away, p_in_hand - v_hand, p_put_away - v_away, p_client_uuid)
  returning * into v_row;
  update member_books set plan_started_on = v_row.counted_on
   where person_id = v_me.id and plan_started_on is null;
  return v_row;
end $$;
revoke execute on function recount_book(uuid, bigint, bigint, uuid) from public;
revoke execute on function recount_book(uuid, bigint, bigint, uuid) from anon;
grant  execute on function recount_book(uuid, bigint, bigint, uuid) to authenticated;
`,X=`
create extension if not exists pg_cron;
create extension if not exists pg_net;
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id),
  person_id  uuid not null references people(id),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  lang       text not null default 'en' check (lang in ('en','ar')),
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy push_subscriptions_read on push_subscriptions for select
  using (person_id = (my_person(family_id)).id);
create policy push_subscriptions_insert on push_subscriptions for insert
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = push_subscriptions.person_id
         and b.family_id = push_subscriptions.family_id
         and b.model = 'flat')
  );
create policy push_subscriptions_update on push_subscriptions for update
  using      (person_id = (my_person(family_id)).id)
  with check (person_id = (my_person(family_id)).id);
create policy push_subscriptions_delete on push_subscriptions for delete
  using (person_id = (my_person(family_id)).id);
revoke update on push_subscriptions from authenticated, anon;
grant  update (lang) on push_subscriptions to authenticated;
create table reminder_times (
  family_id    uuid not null references families(id),
  person_id    uuid not null references people(id),
  at           time not null,
  last_sent_on date null,
  primary key (person_id, at)
);
alter table reminder_times enable row level security;
create policy reminder_times_read on reminder_times for select
  using (person_id = (my_person(family_id)).id);
create policy reminder_times_insert on reminder_times for insert
  with check (
    person_id = (my_person(family_id)).id
    and exists (
      select 1 from member_books b
       where b.person_id = reminder_times.person_id
         and b.family_id = reminder_times.family_id
         and b.model = 'flat')
  );
create policy reminder_times_update on reminder_times for update
  using      (person_id = (my_person(family_id)).id)
  with check (person_id = (my_person(family_id)).id);
create policy reminder_times_delete on reminder_times for delete
  using (person_id = (my_person(family_id)).id);
revoke update on reminder_times from authenticated, anon;
grant  update (at) on reminder_times to authenticated;
create function reminder_times_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_local timestamp;
begin
  if tg_op = 'INSERT'
     and (select count(*) from reminder_times where person_id = new.person_id) >= 4 then
    raise exception 'up to four reminder times a day' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' or new.at is distinct from old.at then
    select now() at time zone coalesce(f.timezone, 'Africa/Cairo') into v_local
      from families f where f.id = new.family_id;
    new.last_sent_on := case when new.at <= v_local::time then v_local::date end;
  end if;
  return new;
end $$;
create trigger reminder_times_guard before insert or update on reminder_times
  for each row execute function reminder_times_guard();
create function due_reminders(p_now timestamptz default now())
returns table (endpoint text, p256dh text, auth text, lang text, is_last_of_day boolean, part_of_day text)
language sql security definer set search_path = public as $$
  with local as (
    select r.person_id, r.family_id, r.at,
           (p_now at time zone coalesce(f.timezone, 'Africa/Cairo')) as ts,
           b.day_closed_on
      from reminder_times r
      join families f     on f.id = r.family_id
      join member_books b on b.person_id = r.person_id and b.family_id = r.family_id
     where b.model = 'flat'
  ), slotted as (
    select l.person_id, l.family_id, l.at, l.ts, l.day_closed_on,
           case when l.ts::time >= l.at then l.ts::date else l.ts::date - 1 end as day
      from local l
  ), due as (
    select s.person_id, s.family_id, s.at, s.day
      from slotted s
     where s.ts - (s.day + s.at) >= interval '0'
       and s.ts - (s.day + s.at) <  interval '60 minutes'
       and s.day_closed_on is distinct from s.day
  ), marked as (
    update reminder_times r
       set last_sent_on = d.day
      from due d
     where r.person_id = d.person_id and r.at = d.at
       and (r.last_sent_on is null or r.last_sent_on < d.day)
    returning r.person_id, r.family_id, r.at
  )
  select s.endpoint, s.p256dh, s.auth, s.lang,
         not exists (select 1 from reminder_times x where x.person_id = m.person_id and x.at > m.at),
         coalesce((select case when max(y.at) < time '12:00' then 'morning'
                               when max(y.at) < time '17:00' then 'lunch'
                               else 'evening' end
                     from reminder_times y
                    where y.person_id = m.person_id and y.at < m.at
                   having max(y.at) is not null), 'morning')
    from marked m
    join push_subscriptions s on s.person_id = m.person_id and s.family_id = m.family_id;
$$;
revoke execute on function due_reminders(timestamptz) from public;
revoke execute on function due_reminders(timestamptz) from anon;
revoke execute on function due_reminders(timestamptz) from authenticated;
create function schedule_reminders(p_url text, p_secret text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_url, '') !~ '^https?://' or length(coalesce(p_secret, '')) < 32 then
    raise exception 'an http(s) address and a secret of 32 characters or more'
      using errcode = 'check_violation';
  end if;
  delete from vault.secrets where name in ('reminder_url', 'reminder_secret');
  perform vault.create_secret(p_url, 'reminder_url');
  perform vault.create_secret(p_secret, 'reminder_secret');
  return cron.schedule('send-reminders', '*/15 * * * *', $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_url'),
      headers := jsonb_build_object(
                   'content-type', 'application/json',
                   'x-reminder-secret',
                   (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_secret')),
      body    := '{}'::jsonb)
  $job$);
end $$;
revoke execute on function schedule_reminders(text, text) from public;
revoke execute on function schedule_reminders(text, text) from anon;
revoke execute on function schedule_reminders(text, text) from authenticated;
`,Z=`
create function start_book_clean(p_family uuid)
returns date
language plpgsql security definer set search_path = public as $$
declare
  v_me    people;
  v_book  member_books;
  v_today date;
begin
  v_me := my_person(p_family);
  if v_me.id is not null then
    select * into v_book from member_books
     where person_id = v_me.id and family_id = p_family
       for update;
  end if;
  if v_me.id is null or v_book.person_id is null or v_book.model <> 'flat' then
    raise exception 'not a member with a flat book in this family'
      using errcode = 'insufficient_privilege';
  end if;
  delete from member_payments where person_id = v_me.id and family_id = p_family;
  delete from member_incomes  where person_id = v_me.id and family_id = p_family;
  delete from member_splits   where person_id = v_me.id and family_id = p_family;
  delete from member_debts    where person_id = v_me.id and family_id = p_family;
  delete from member_recounts where person_id = v_me.id and family_id = p_family;
  v_today := family_today(p_family);
  update member_books
     set started_on      = v_today,
         plan_started_on = null,
         plan_next_on    = null,
         plan_next_for   = null,
         day_closed_on   = null
   where person_id = v_me.id and family_id = p_family;
  return v_today;
end $$;
revoke execute on function start_book_clean(uuid) from public;
revoke execute on function start_book_clean(uuid) from anon;
grant  execute on function start_book_clean(uuid) to authenticated;
`,re=`
alter table families add column if not exists car_driver_owed_from date;
update families f
   set car_driver_owed_from = i.last_day + 1
  from (select family_id, max(drive_date) as last_day
          from car_days where note = 'imported from the car sheet'
         group by family_id) i
 where i.family_id = f.id;
create or replace function car_driver_owed(p_family uuid)
returns bigint
language plpgsql stable security definer set search_path = public as $$
declare
  v_me    people;
  v_spent bigint;
  v_paid  bigint;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is null
     or v_me.role not in ('admin', 'viewer', 'driver') then
    raise exception 'only the admin, the viewer or the driver reads what the car owes the driver'
      using errcode = 'insufficient_privilege';
  end if;
  select coalesce(sum(-d.profit_egp), 0) into v_spent
    from car_days d
    join people p on p.id = d.submitted_by
   where d.family_id = p_family
     and d.kind = 'day'
     and d.status = 'approved'
     and d.voided_at is null
     and d.profit_egp < 0
     and p.role = 'driver'
     and d.drive_date >= coalesce((select car_driver_owed_from from families
                                    where id = p_family), d.drive_date);
  select coalesce(sum(c.amount_egp), 0) into v_paid
    from car_payouts c
    join people p on p.id = c.person_id
   where c.family_id = p_family
     and c.voided_at is null
     and p.role = 'driver';
  return v_spent - v_paid;
end $$;
revoke all on function car_driver_owed(uuid) from public, anon;
grant execute on function car_driver_owed(uuid) to authenticated;
create or replace view car_book with (security_invoker = on) as
select f.id                                          as family_id,
       f.car_owner_person                            as owner_person,
       f.car_share_person                            as sharer_person,
       (coalesce(d.owner, 0)  - coalesce(p.owner, 0))::bigint  as owner_owed,
       (coalesce(d.sharer, 0) - coalesce(p.sharer, 0))::bigint as sharer_owed,
       coalesce(d.pending_cash, 0)::bigint           as pending_cash,
       coalesce(d.pending_count, 0)::bigint          as pending_count,
       (select dp.id from people dp
         where dp.family_id = f.id and dp.role = 'driver'
         order by dp.active desc, dp.member_no, dp.id limit 1) as driver_person,
       car_driver_owed(f.id)                         as driver_owed
  from families f
  left join lateral (
    select sum(owner_egp)  filter (where status = 'approved') as owner,
           sum(sharer_egp) filter (where status = 'approved') as sharer,
           sum(profit_egp) filter (where status = 'pending')  as pending_cash,
           count(*)        filter (where status = 'pending')  as pending_count
      from car_days where family_id = f.id and voided_at is null) d on true
  left join lateral (
    select sum(amount_egp) filter (where person_id = f.car_owner_person) as owner,
           sum(amount_egp) filter (where person_id = f.car_share_person) as sharer
      from car_payouts where family_id = f.id and voided_at is null) p on true
 where my_role(f.id) in ('admin','viewer');
create policy car_payouts_driver_reads_his_own on car_payouts for select
  using (my_role(family_id) = 'driver'
         and person_id = (my_person(family_id)).id);
create or replace function record_car_payout(
  p_family      uuid,
  p_person      uuid,
  p_amount      bigint,
  p_paid_on     date default null,
  p_note        text default null,
  p_client_uuid uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me     people;
  v_fam    families;
  v_driver boolean;
  v_id     uuid;
begin
  v_me := my_person(p_family);
  if v_me.id is null or v_me.role is distinct from 'admin' then
    raise exception 'only the admin pays the car''s owners'
      using errcode = 'insufficient_privilege';
  end if;
  if p_client_uuid is not null then
    select id into v_id from car_payouts where client_uuid = p_client_uuid;
    if v_id is not null then return v_id; end if;
  end if;
  select * into v_fam from families where id = p_family;
  select exists (select 1 from people
                  where id = p_person and family_id = p_family and role = 'driver')
    into v_driver;
  if p_person is null or (p_person is distinct from v_fam.car_owner_person
                          and p_person is distinct from v_fam.car_share_person
                          and not v_driver) then
    raise exception 'that person does not own or drive the car'
      using errcode = 'check_violation';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'a payment needs an amount';
  end if;
  if v_driver and p_amount < 0 then
    raise exception 'a payment to the driver is money paid to him'
      using errcode = 'check_violation';
  end if;
  if coalesce(p_paid_on, family_today(p_family)) > family_today(p_family) then
    raise exception 'that day has not happened yet';
  end if;
  insert into car_payouts (family_id, person_id, amount_egp, paid_on, note,
                           recorded_by, client_uuid)
       values (p_family, p_person, p_amount,
               coalesce(p_paid_on, family_today(p_family)), nullif(p_note, ''),
               v_me.id, p_client_uuid)
    returning id into v_id;
  return v_id;
end $$;
`,ie=`-- Stand-ins for what Supabase provides around a project's own schema.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists extensions;
create table if not exists auth.users (
  id uuid primary key, email text unique, encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb,
  last_sign_in_at timestamptz, email_confirmed_at timestamptz, created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create schema if not exists cron;
create or replace function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
create or replace function cron.unschedule(a text) returns boolean language sql as $$ select true $$;
create table if not exists cron.job (jobid bigint, jobname text, schedule text, active boolean);
create schema if not exists net;
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language sql as $$ select 1::bigint $$;
create schema if not exists vault;
create table if not exists vault.secrets (id uuid default gen_random_uuid(), name text, secret text);
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(s text, n text) returns uuid language sql as
  $$ insert into vault.secrets(name, secret) values (n, s) returning id $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`,ae=Object.entries(Object.assign({"./migrations/0001_identity.sql":n,"./migrations/0002_ledger.sql":r,"./migrations/0003_money.sql":ee,"./migrations/0004_car.sql":te,"./migrations/0005_loans_personal.sql":i,"./migrations/0006_rls.sql":a,"./migrations/0007_recording.sql":o,"./migrations/0008_views_security_invoker.sql":s,"./migrations/0009_definer_argument_guards.sql":c,"./migrations/0010_allowances.sql":l,"./migrations/0011_allowance_rate_for_period.sql":u,"./migrations/0012_car_posts_to_the_ledger.sql":d,"./migrations/0013_car_shares_and_losses.sql":f,"./migrations/0014_remittances.sql":p,"./migrations/0015_the_family_day.sql":m,"./migrations/0016_loans.sql":h,"./migrations/0017_her_own_day.sql":g,"./migrations/0018_a_family_keeps_an_admin.sql":_,"./migrations/0019_add_a_category.sql":v,"./migrations/0020_a_category_belongs_to_the_family.sql":y,"./migrations/0021_first_sign_in_sets_a_password.sql":b,"./migrations/0022_an_allowance_can_be_undone.sql":x,"./migrations/0023_a_journal_is_reversed_once.sql":S,"./migrations/0024_correcting_an_entry_keeps_both.sql":C,"./migrations/0025_deleting_an_entry_leaves_a_record.sql":w,"./migrations/0026_a_removed_entry_leaves_the_list.sql":T,"./migrations/0027_the_car_belongs_to_its_owners.sql":E,"./migrations/0028_an_allowance_is_family_money_only.sql":D,"./migrations/0029_the_car_keeps_its_own_book.sql":ne,"./migrations/0030_a_car_day_can_be_corrected.sql":O,"./migrations/0031_an_allowance_is_what_abdo_hands_over.sql":k,"./migrations/0032_an_opening_balance.sql":A,"./migrations/0033_an_undone_payment_leaves_the_list.sql":j,"./migrations/0034_the_allowance_category_stays.sql":M,"./migrations/0035_a_rejection_says_why.sql":N,"./migrations/0036_the_admin_takes_a_second_step.sql":P,"./migrations/0037_the_operator_watches_the_machine.sql":F,"./migrations/0038_a_member_keeps_their_own_book.sql":I,"./migrations/0039_the_admin_signs_in_like_everyone_else.sql":L,"./migrations/0040_a_member_keeps_track_of_what_they_owe.sql":R,"./migrations/0041_a_member_can_correct_their_book.sql":z,"./migrations/0042_what_others_owe_a_member.sql":B,"./migrations/0043_the_old_approval_queue_goes.sql":V,"./migrations/0044_adding_a_person_happens_once.sql":H,"./migrations/0045_what_the_family_had_on_a_day.sql":U,"./migrations/0046_a_removal_is_dated_the_day_it_undoes.sql":W,"./migrations/0047_money_in_and_out_for_the_admin.sql":G,"./migrations/0048_the_report_answers_at_once.sql":K,"./migrations/0049_a_loan_is_deleted_with_its_repayments.sql":q,"./migrations/0050_a_book_can_be_flat.sql":J,"./migrations/0051_a_flat_book_has_a_plan.sql":Y,"./migrations/0052_a_reminder_is_a_nudge.sql":X,"./migrations/0053_a_book_can_start_clean.sql":Z,"./migrations/0054_the_car_owes_joe_what_he_paid.sql":re})).sort(([e],[t])=>e.localeCompare(t));document.getElementById(`root`);var Q=document.createElement(`div`);Q.id=`demo-loading`,Q.innerHTML=`<div class="demo-spin"></div><p>Starting the demo database in your browser…</p><small></small>`,document.body.appendChild(Q);var $=e=>{Q.querySelector(`small`).textContent=e};try{await t({prelude:ie,migrations:ae,onStatus:$}),Q.remove(),await e(()=>import(`./demo-bar-DF1AtTn8.js`),__vite__mapDeps([0,1,2,3,4]),import.meta.url),await e(()=>import(`./main-DD4kFHEQ.js`),__vite__mapDeps([5,2,4,6]),import.meta.url)}catch(e){console.error(e),Q.querySelector(`p`).textContent=`The demo could not start in this browser.`,$(String(e?.message??e))}