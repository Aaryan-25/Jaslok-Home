-- =====================================================================
-- Jaslok Homecare — database setup for Supabase
-- Run ONCE: Supabase dashboard → SQL Editor → New query → paste all → Run.
-- Safe to run again (it only adds what is missing and replaces functions).
--
-- Security model: the website talks to the database ONLY through the
-- functions below. Every table has row-level security switched on with
-- no policies, so the public key cannot read or change any table
-- directly. Each function checks who is logged in (session token) and
-- returns only what that person is allowed to see.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('admin','patient','staff')),
  name text not null,
  login text not null unique,            -- 'admin' | patient mobile (10 digits) | staff ID (lower case)
  phone text default '', phone10 text default '',
  email text default '', address text default '',
  staff_id text default '', daily_rate numeric,
  active boolean not null default true,
  must_change boolean not null default false,
  case_ids text[] not null default '{}',
  pw_hash text not null,
  failed int not null default 0, locked_until timestamptz,
  created_at timestamptz not null default now(), last_login timestamptz
);
create unique index if not exists accounts_one_admin on public.accounts(role) where role='admin';
create unique index if not exists accounts_email on public.accounts(lower(email)) where email<>'';

create table if not exists public.sessions (
  token_hash text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  from_id uuid references public.accounts(id) on delete set null,
  from_role text not null, from_name text not null,
  to_target text not null,               -- 'admin' | 'everyone' | 'patients' | 'staffs' | account id
  subject text default '', body text default '',
  case_id text, case_label text default '',
  urgent boolean not null default false,
  status text not null default 'open',
  shared boolean not null default false,
  replies jsonb not null default '[]',
  read_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new', note text default '',
  name text not null, phone text not null, phone10 text default '',
  email text default '', service text default '', locality text default '',
  start_date text default '', message text default '', case_id text
);

create table if not exists public.settings ( id int primary key default 1 check (id=1), data jsonb not null default '{}' );
insert into public.settings(id,data) values (1,'{"staffSeesPatientBilling":true,"staffSeesPatientPhone":true}') on conflict do nothing;

create table if not exists public.board ( id int primary key default 1 check (id=1), state jsonb, saved_at bigint default 0, updated_at timestamptz default now() );

create table if not exists public.cases (
  id text primary key, phone10 text default '', staff_keys text[] not null default '{}',
  cells jsonb not null default '{}', sort int default 0
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.accounts(id) on delete set null, owner_name text default '', owner_role text default '',
  target text not null check (target in ('post','case','inquiry')), target_id text not null,
  visible_to text not null default 'office' check (visible_to in ('office','patient','staff','both')),
  name text not null, mime text not null, size int not null, data bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists files_target on public.files(target, target_id);
alter table public.files drop constraint if exists files_target_check;
alter table public.files add constraint files_target_check check (target in ('post','case','inquiry','profile'));

-- nurse public profiles (v4)
alter table public.accounts add column if not exists public_slug text;
alter table public.accounts add column if not exists profile jsonb not null default '{}';
create unique index if not exists accounts_slug on public.accounts(public_slug) where public_slug is not null;
alter table public.inquiries add column if not exists requested_staff uuid references public.accounts(id) on delete set null;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.accounts(id) on delete cascade,
  patient_id uuid not null references public.accounts(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text default '', verified boolean not null default false, hidden boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (staff_id, patient_id)
);
alter table public.reviews enable row level security;
revoke all on public.reviews from public;
do $$ begin if exists(select 1 from pg_roles where rolname='anon') then execute 'revoke all on public.reviews from anon, authenticated'; end if; end $$;

alter table public.files     enable row level security;
alter table public.accounts  enable row level security;
alter table public.sessions  enable row level security;
alter table public.posts     enable row level security;
alter table public.inquiries enable row level security;
alter table public.settings  enable row level security;
alter table public.board     enable row level security;
alter table public.cases     enable row level security;
revoke all on public.accounts, public.sessions, public.posts, public.inquiries, public.settings, public.board, public.cases, public.files from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on public.accounts, public.sessions, public.posts, public.inquiries, public.settings, public.board, public.cases, public.files from anon, authenticated';
  end if; end $$;

-- ------------------------------------------------------- internal helpers
create or replace function public._p10(p text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p,''),'\D','','g'))>=10 then right(regexp_replace(p,'\D','','g'),10) else '' end $$;

create or replace function public._ms(t timestamptz) returns bigint language sql immutable as $$ select (extract(epoch from t)*1000)::bigint $$;

create or replace function public._pw_ok(pw text) returns void language plpgsql as $$
begin
  if pw is null or length(pw)<8 then raise exception 'Password must be at least 8 characters.'; end if;
  if pw !~ '[0-9]' or pw !~* '[a-z]' then raise exception 'Use letters and at least one number.'; end if;
end $$;

create or replace function public._hash(pw text) returns text language sql
  set search_path = public, extensions as $$ select crypt(pw, gen_salt('bf',10)) $$;

create or replace function public._check(pw text, h text) returns boolean language sql
  set search_path = public, extensions as $$ select h = crypt(coalesce(pw,''), h) $$;

create or replace function public._new_session(a public.accounts) returns json language plpgsql
  security definer set search_path = public, extensions as $$
declare tok text := encode(gen_random_bytes(32),'hex');
begin
  delete from sessions where expires_at < now();
  insert into sessions(token_hash, account_id, expires_at)
    values (encode(digest(tok,'sha256'),'hex'), a.id, now() + case when a.role='admin' then interval '12 hours' else interval '30 days' end);
  return json_build_object('token', tok, 'role', a.role);
end $$;

create or replace function public._me(tok text) returns public.accounts language plpgsql
  security definer set search_path = public, extensions as $$
declare a accounts;
begin
  select ac.* into a from sessions s join accounts ac on ac.id=s.account_id
   where s.token_hash = encode(digest(coalesce(tok,''),'sha256'),'hex') and s.expires_at > now() and ac.active;
  if a.id is null then raise exception 'Please log in again.' using errcode='28000'; end if;
  return a;
end $$;

create or replace function public._admin(tok text) returns public.accounts language plpgsql
  security definer set search_path = public as $$
declare a accounts := _me(tok);
begin if a.role<>'admin' then raise exception 'Admin only' using errcode='42501'; end if; return a; end $$;

create or replace function public._pub(a public.accounts) returns json language sql stable as $$
  select json_build_object('id',a.id,'role',a.role,'name',a.name,'login',a.login,'phone',a.phone,'email',a.email,'address',a.address,
    'active',a.active,'mustChange',a.must_change,'caseIds',to_json(a.case_ids),'dailyRate',a.daily_rate,'staffId',a.staff_id,
    'created',_ms(a.created_at),'lastLogin',_ms(a.last_login),'slug',a.public_slug,'profile',a.profile,
    'photoId',(select f.id from files f where f.target='profile' and f.target_id=a.id::text order by f.created_at desc limit 1)) $$;

create or replace function public._staff_keys(a public.accounts) returns text[] language sql immutable as $$
  select array_remove(array[lower(trim(a.name)), nullif(lower(trim(a.staff_id)),'')], null) $$;

-- ids of the cases this person may see
create or replace function public._my_case_ids(a public.accounts) returns text[] language sql stable
  security definer set search_path = public as $$
  select coalesce(array_agg(c.id),'{}') from cases c where
    a.role='admin'
    or (a.role='patient' and ((a.phone10<>'' and c.phone10=a.phone10) or c.id = any(a.case_ids)))
    or (a.role='staff' and c.staff_keys && _staff_keys(a)) $$;

create or replace function public._can_see(a public.accounts, p public.posts, my_cases text[]) returns boolean language sql stable as $$
  select a.role='admin' or p.from_id=a.id or p.to_target in (a.id::text,'everyone', a.role||'s')
      or (a.role='staff' and p.shared and p.case_id = any(my_cases)) $$;

create or replace function public._files(p_target text, p_id text, p_vis text[]) returns json language sql stable
  security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size,'visibleTo',f.visible_to,'by',f.owner_name,'byRole',f.owner_role,'at',_ms(f.created_at)) order by f.created_at),'[]')
  from files f where f.target=p_target and f.target_id=p_id and (p_vis is null or f.visible_to = any(p_vis)) $$;

create or replace function public._post_json(p public.posts) returns json language sql stable as $$
  select json_build_object('files',_files('post',p.id::text,null),'id',p.id,'kind',p.kind,'from',json_build_object('id',p.from_id,'role',p.from_role,'name',p.from_name),
    'to',p.to_target,'subject',p.subject,'body',p.body,'caseId',p.case_id,'caseLabel',p.case_label,'urgent',p.urgent,
    'at',_ms(p.created_at),'status',p.status,'shared',p.shared,'replies',p.replies,'readBy',to_json(p.read_by)) $$;

create or replace function public._strip(cells jsonb, rx text) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) from jsonb_each(cells) e(k,v) where rx is null or k !~* rx $$;

create or replace function public._slug(p_name text) returns text language sql volatile as $$
  select trim(both '-' from left(regexp_replace(lower(coalesce(p_name,'nurse')),'[^a-z0-9]+','-','g'),40)) || '-' || substr(md5(random()::text||clock_timestamp()::text),1,5) $$;
update public.accounts set public_slug = public._slug(name) where role='staff' and public_slug is null;

-- ------------------------------------------------------------ public API
create or replace function public.has_admin() returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from accounts where role='admin') $$;

create or replace function public.create_admin(p_name text, p_password text) returns json language plpgsql
  security definer set search_path = public, extensions as $$
declare a accounts;
begin
  perform pg_advisory_xact_lock(4242);
  if exists(select 1 from accounts where role='admin') then raise exception 'An admin account already exists. There can be only one.'; end if;
  perform _pw_ok(p_password);
  insert into accounts(role,name,login,pw_hash) values ('admin', coalesce(nullif(trim(p_name),''),'Administrator'), 'admin', _hash(p_password)) returning * into a;
  return _new_session(a);
end $$;

create or replace function public.signup_patient(p_name text, p_phone text, p_email text, p_address text, p_password text) returns json language plpgsql
  security definer set search_path = public, extensions as $$
declare a accounts; p text := _p10(p_phone); e text := lower(trim(coalesce(p_email,'')));
begin
  if trim(coalesce(p_name,''))='' then raise exception 'Please enter the patient’s name.'; end if;
  if p='' then raise exception 'Enter a 10-digit mobile number.'; end if;
  if e<>'' and e !~ '^\S+@\S+\.\S+$' then raise exception 'That email address does not look right.'; end if;
  perform _pw_ok(p_password);
  if exists(select 1 from accounts where login=p) then raise exception 'An account with this mobile number already exists. Please log in.'; end if;
  if e<>'' and exists(select 1 from accounts where lower(email)=e) then raise exception 'An account with this email already exists.'; end if;
  insert into accounts(role,name,login,phone,phone10,email,address,pw_hash)
    values ('patient', trim(p_name), p, trim(p_phone), p, e, trim(coalesce(p_address,'')), _hash(p_password)) returning * into a;
  return _new_session(a);
end $$;

create or replace function public.login(p_id text, p_password text) returns json language plpgsql
  security definer set search_path = public, extensions as $$
declare a accounts; k text := lower(trim(coalesce(p_id,''))); p text := _p10(p_id);
begin
  select * into a from accounts where login=k or (email<>'' and lower(email)=k) or (p<>'' and role='patient' and phone10=p) limit 1;
  if a.id is null then perform pg_sleep(0.3); raise exception 'Wrong login ID or password.'; end if;
  if a.locked_until is not null and a.locked_until > now() then raise exception 'Too many wrong passwords. Try again in 10 minutes.'; end if;
  if not _check(p_password, a.pw_hash) then
    update accounts set failed = failed+1, locked_until = case when failed+1>=8 then now()+interval '10 minutes' else null end where id=a.id;
    raise exception 'Wrong login ID or password.';
  end if;
  if not a.active then raise exception 'This account is switched off. Please contact Jaslok Homecare.'; end if;
  update accounts set failed=0, locked_until=null, last_login=now() where id=a.id;
  return _new_session(a);
end $$;

create or replace function public.logout(p_token text) returns void language sql security definer set search_path = public, extensions as $$
  delete from sessions where token_hash = encode(digest(coalesce(p_token,''),'sha256'),'hex') $$;

create or replace function public.change_password(p_token text, p_old text, p_new text) returns void language plpgsql
  security definer set search_path = public, extensions as $$
declare a accounts := _me(p_token);
begin
  if not _check(p_old, a.pw_hash) then raise exception 'Current password is wrong.'; end if;
  perform _pw_ok(p_new);
  update accounts set pw_hash=_hash(p_new), must_change=false where id=a.id;
  delete from sessions where account_id=a.id and token_hash <> encode(digest(p_token,'sha256'),'hex');
end $$;

-- Everything one person may see, in one call
create or replace function public.get_state(p_token text) returns json language plpgsql
  security definer set search_path = public, extensions as $$
declare a accounts := _me(p_token); s jsonb; ids text[]; strip text; res json;
begin
  select data into s from settings where id=1;
  ids := _my_case_ids(a);
  if a.role='patient' then strip := 'payout|margin|staff (rate|pay|cost|salary)|cost|procurement|remark|note';
  elsif a.role='staff' then
    strip := 'margin|cost|procurement';
    if not coalesce((s->>'staffSeesPatientBilling')::boolean,true) then strip := strip||'|rate|amount|total|paid|payment|billed|deposit|invoice'; end if;
    if not coalesce((s->>'staffSeesPatientPhone')::boolean,true) then strip := strip||'|phone|mobile|contact|whatsapp'; end if;
  end if;
  select json_build_object(
    'me', _pub(a),
    'settings', s - 'caseColumns',
    'caseColumns', coalesce(s->'caseColumns','[]'::jsonb),
    'posts', coalesce((select json_agg(_post_json(p) order by p.created_at desc) from posts p where _can_see(a,p,ids)),'[]'),
    'cases', case when a.role='admin' then '[]'::json else coalesce((select json_agg(json_build_object('id',c.id,'cells',_strip(c.cells,strip),
        'files',_files('case',c.id, case when a.role='patient' then array['patient','both'] else array['staff','both'] end)) order by c.sort) from cases c where c.id = any(ids)),'[]') end,
    'reviews', case when a.role='admin' then coalesce((select json_agg(json_build_object('id',r.id,'staffId',r.staff_id,'staffName',st.name,'patientId',r.patient_id,'patientName',pa.name,
        'rating',r.rating,'comment',r.comment,'verified',r.verified,'hidden',r.hidden,'at',_ms(r.updated_at)) order by r.updated_at desc)
        from reviews r join accounts st on st.id=r.staff_id join accounts pa on pa.id=r.patient_id),'[]') end,
    'nurses', case when a.role<>'admin' then coalesce((select json_agg(json_build_object('name',x.name,'staffId',x.staff_id,'slug',x.public_slug)) from accounts x
        where x.role='staff' and x.active and x.public_slug is not null and coalesce((x.profile->>'public')::boolean,true)
          and (x.id=a.id or exists(select 1 from cases c where c.id = any(ids) and c.staff_keys && _staff_keys(x)))),'[]') end,
    'caseFiles', case when a.role='admin' then coalesce((select json_object_agg(t.target_id, _files('case',t.target_id,null)) from (select distinct target_id from files where target='case') t),'{}') end,
    'accounts', case when a.role='admin' then coalesce((select json_agg(_pub(x) order by x.created_at) from accounts x),'[]') end,
    'inquiries', case when a.role='admin' then coalesce((select json_agg(json_build_object('id',i.id,'at',_ms(i.created_at),'status',i.status,'note',i.note,'name',i.name,'phone',i.phone,
        'email',i.email,'service',i.service,'locality',i.locality,'startDate',i.start_date,'message',i.message,'caseId',i.case_id,'files',_files('inquiry',i.id::text,null),'requestedStaff',i.requested_staff,
        'requestedName',(select x.name from accounts x where x.id=i.requested_staff)) order by i.created_at desc) from inquiries i),'[]') end
  ) into res;
  return res;
end $$;

create or replace function public.add_post(p_token text, p_kind text, p_to text, p_subject text, p_body text, p_case_id text, p_case_label text, p_urgent boolean) returns uuid language plpgsql
  security definer set search_path = public as $$
declare a accounts := _me(p_token); r uuid; ids text[];
begin
  if trim(coalesce(p_body,''))='' and trim(coalesce(p_subject,''))='' then raise exception 'Please write something first.'; end if;
  if length(coalesce(p_body,''))>8000 then raise exception 'Message is too long.'; end if;
  if a.role<>'admin' then
    p_to := 'admin';
    if a.role='patient' and p_kind not in ('query','feedback','report-staff','other') then raise exception 'Not allowed'; end if;
    if a.role='staff' and p_kind not in ('handover','patient-update','alert','query') then raise exception 'Not allowed'; end if;
    if p_case_id is not null then ids := _my_case_ids(a); if not (p_case_id = any(ids)) then p_case_id := null; p_case_label := ''; end if; end if;
  elsif p_kind not in ('notice','message') then raise exception 'Not allowed';
  end if;
  insert into posts(kind,from_id,from_role,from_name,to_target,subject,body,case_id,case_label,urgent,read_by)
    values (p_kind,a.id,a.role,a.name,coalesce(p_to,'admin'),left(trim(coalesce(p_subject,'')),200),trim(coalesce(p_body,'')),p_case_id,coalesce(p_case_label,''),coalesce(p_urgent,false),array[a.id])
    returning id into r;
  return r;
end $$;

create or replace function public.reply_post(p_token text, p_id uuid, p_body text) returns void language plpgsql
  security definer set search_path = public as $$
declare a accounts := _me(p_token); p posts;
begin
  select * into p from posts where id=p_id;
  if p.id is null or not _can_see(a,p,_my_case_ids(a)) then raise exception 'Not found'; end if;
  if p.kind='notice' then raise exception 'Notices cannot be replied to.'; end if;
  if a.role<>'admin' and not (p.from_id=a.id or p.to_target=a.id::text) then raise exception 'Not allowed'; end if;
  if trim(coalesce(p_body,''))='' then raise exception 'Write a reply first.'; end if;
  update posts set replies = replies || jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from',jsonb_build_object('id',a.id,'role',a.role,'name',a.name),'body',left(trim(p_body),8000),'at',_ms(now()))),
    read_by = array[a.id], status = case when a.role<>'admin' then 'open' else status end where id=p_id;
end $$;

create or replace function public.mark_read(p_token text, p_ids uuid[]) returns void language plpgsql
  security definer set search_path = public as $$
declare a accounts := _me(p_token); ids text[] := _my_case_ids(a);
begin
  update posts p set read_by = array_append(read_by, a.id) where p.id = any(p_ids) and not (a.id = any(read_by)) and _can_see(a,p,ids);
end $$;

-- inquiries from the public website (no login)
drop function if exists public.submit_inquiry(text,text,text,text,text,text,text);
drop function if exists public.submit_inquiry(text,text,text,text,text,text,text,text);
create or replace function public.submit_inquiry(p_name text, p_phone text, p_email text, p_service text, p_locality text, p_start_date text, p_message text, p_staff_slug text default null) returns uuid language plpgsql
  security definer set search_path = public as $$
declare p text := _p10(p_phone); r uuid; sid uuid;
begin
  if trim(coalesce(p_name,''))='' then raise exception 'Please enter a name.'; end if;
  if p='' then raise exception 'Please enter a 10-digit mobile number so we can call you back.'; end if;
  if (select count(*) from inquiries where phone10=p and created_at > now()-interval '1 day') >= 5 then raise exception 'We already have your inquiry. Our team will call you soon.'; end if;
  if (select count(*) from inquiries where created_at > now()-interval '1 hour') >= 200 then raise exception 'Too many inquiries right now. Please call us instead.'; end if;
  if p_staff_slug is not null then select id into sid from accounts where public_slug=p_staff_slug and role='staff' and active; end if;
  insert into inquiries(name,phone,phone10,email,service,locality,start_date,message,requested_staff)
    values (left(trim(p_name),120), left(trim(p_phone),30), p, left(trim(coalesce(p_email,'')),200), left(coalesce(p_service,''),120), left(trim(coalesce(p_locality,'')),200), left(coalesce(p_start_date,''),20), left(trim(coalesce(p_message,'')),4000), sid)
    returning id into r;
  return r;
end $$;

-- ------------------------------------------------------------ admin API
create or replace function public.admin_set_post(p_token text, p_id uuid, p_patch jsonb) returns void language plpgsql
  security definer set search_path = public as $$
begin perform _admin(p_token);
  update posts set status = coalesce(p_patch->>'status', status), shared = coalesce((p_patch->>'shared')::boolean, shared) where id=p_id; end $$;

create or replace function public.admin_delete_post(p_token text, p_id uuid) returns void language plpgsql
  security definer set search_path = public as $$ begin perform _admin(p_token); delete from posts where id=p_id; end $$;

create or replace function public.admin_update_inquiry(p_token text, p_id uuid, p_patch jsonb) returns void language plpgsql
  security definer set search_path = public as $$
begin perform _admin(p_token);
  update inquiries set status = coalesce(p_patch->>'status',status), note = coalesce(p_patch->>'note',note), case_id = coalesce(p_patch->>'caseId',case_id) where id=p_id; end $$;

create or replace function public.admin_delete_inquiry(p_token text, p_id uuid) returns void language plpgsql
  security definer set search_path = public as $$ begin perform _admin(p_token); delete from inquiries where id=p_id; end $$;

create or replace function public.admin_create_staff(p_token text, p_name text, p_staff_id text, p_phone text, p_rate numeric, p_password text) returns json language plpgsql
  security definer set search_path = public, extensions as $$
declare a accounts; k text := lower(trim(coalesce(p_staff_id,'')));
begin perform _admin(p_token);
  if trim(coalesce(p_name,''))='' or k='' then raise exception 'Name and Staff ID are both needed.'; end if;
  if k ~ '^\d{10,}$' then raise exception 'Staff ID cannot be a phone number. Use something like JH101.'; end if;
  if exists(select 1 from accounts where login=k) then raise exception 'That Staff ID is already in use.'; end if;
  perform _pw_ok(p_password);
  insert into accounts(role,name,login,staff_id,phone,phone10,daily_rate,pw_hash,must_change,public_slug,profile)
    values ('staff',trim(p_name),k,trim(p_staff_id),trim(coalesce(p_phone,'')),_p10(p_phone),p_rate,_hash(p_password),true,_slug(p_name),
            jsonb_build_object('public',true,'workingSince',to_char(now(),'YYYY-MM-DD'))) returning * into a;
  return _pub(a);
end $$;

create or replace function public.admin_update_account(p_token text, p_id uuid, p_patch jsonb) returns void language plpgsql
  security definer set search_path = public as $$
declare a accounts;
begin perform _admin(p_token);
  select * into a from accounts where id=p_id; if a.id is null then raise exception 'Account not found'; end if;
  if a.role='admin' and (p_patch->>'active')='false' then raise exception 'The admin account cannot be switched off.'; end if;
  update accounts set
    name = coalesce(nullif(trim(p_patch->>'name'),''), name),
    phone = coalesce(p_patch->>'phone', phone),
    phone10 = case when p_patch ? 'phone' then _p10(p_patch->>'phone') else phone10 end,
    login = case when role='patient' and p_patch ? 'phone' and _p10(p_patch->>'phone')<>'' then _p10(p_patch->>'phone') else login end,
    email = coalesce(lower(p_patch->>'email'), email),
    address = coalesce(p_patch->>'address', address),
    daily_rate = case when p_patch ? 'dailyRate' then nullif(regexp_replace(coalesce(p_patch->>'dailyRate',''),'[^0-9.]','','g'),'')::numeric else daily_rate end,
    active = coalesce((p_patch->>'active')::boolean, active),
    case_ids = case when p_patch ? 'caseIds' then array(select jsonb_array_elements_text(p_patch->'caseIds')) else case_ids end
  where id=p_id;
  if (p_patch->>'active')='false' then delete from sessions where account_id=p_id; end if;
end $$;

create or replace function public.admin_reset_password(p_token text, p_id uuid, p_password text) returns void language plpgsql
  security definer set search_path = public, extensions as $$
begin perform _admin(p_token); perform _pw_ok(p_password);
  update accounts set pw_hash=_hash(p_password), must_change = (role<>'admin'), failed=0, locked_until=null where id=p_id;
  delete from sessions where account_id=p_id and (select role from accounts where id=p_id)<>'admin';
end $$;

create or replace function public.admin_delete_account(p_token text, p_id uuid) returns void language plpgsql
  security definer set search_path = public as $$
begin perform _admin(p_token);
  if (select role from accounts where id=p_id)='admin' then raise exception 'Cannot delete the admin account'; end if;
  delete from accounts where id=p_id;
end $$;

create or replace function public.admin_set_settings(p_token text, p_patch jsonb) returns void language plpgsql
  security definer set search_path = public as $$
begin perform _admin(p_token); update settings set data = data || (p_patch - 'caseColumns') where id=1; end $$;

create or replace function public.admin_load_board(p_token text) returns json language plpgsql
  security definer set search_path = public as $$
declare r json;
begin perform _admin(p_token);
  select json_build_object('state',state,'savedAt',saved_at) into r from board where id=1;
  return r;
end $$;

-- p_cases: [{id, phone10, staffKeys:[..], cells:{..}}] — the Patient Data rows, rebuilt on every save
create or replace function public.admin_save_board(p_token text, p_state jsonb, p_saved_at bigint, p_cases jsonb, p_columns jsonb, p_days_inclusive boolean) returns void language plpgsql
  security definer set search_path = public as $$
begin perform _admin(p_token);
  insert into board(id,state,saved_at,updated_at) values (1,p_state,p_saved_at,now())
    on conflict (id) do update set state=excluded.state, saved_at=excluded.saved_at, updated_at=now();
  delete from cases where true;
  insert into cases(id,phone10,staff_keys,cells,sort)
    select c->>'id', coalesce(c->>'phone10',''), coalesce(array(select lower(trim(x)) from jsonb_array_elements_text(c->'staffKeys') x where trim(x)<>''),'{}'), coalesce(c->'cells','{}'::jsonb), (ord-1)::int
    from jsonb_array_elements(coalesce(p_cases,'[]'::jsonb)) with ordinality as t(c,ord);
  update settings set data = data || jsonb_build_object('caseColumns', coalesce(p_columns,'[]'::jsonb), 'daysInclusive', coalesce(p_days_inclusive,true)) where id=1;
end $$;

-- ------------------------------------------------------- documents
create or replace function public._file_ok(p_name text, p_mime text, p_b64 text) returns bytea language plpgsql as $$
declare d bytea;
begin
  if coalesce(p_mime,'') !~* '^(image/(jpeg|png|webp|heic|heif|gif)|application/pdf|text/plain|application/msword|application/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application/vnd\.ms-excel)$'
    then raise exception 'This file type is not allowed. Use a photo, PDF, Word or Excel file.'; end if;
  begin d := decode(p_b64,'base64'); exception when others then raise exception 'The file could not be read.'; end;
  if length(d) > 5*1024*1024 then raise exception 'File is larger than 5 MB.'; end if;
  if length(d) = 0 then raise exception 'The file is empty.'; end if;
  return d;
end $$;

-- attach to a message (participants) or to a case (admin only, choose who can see it)
create or replace function public.upload_file(p_token text, p_target text, p_target_id text, p_name text, p_mime text, p_b64 text, p_visible text) returns json language plpgsql
  security definer set search_path = public as $$
declare a accounts := _me(p_token); d bytea; p posts; r files;
begin
  d := _file_ok(p_name, p_mime, p_b64);
  if p_target='post' then
    select * into p from posts where id = p_target_id::uuid;
    if p.id is null or not _can_see(a,p,_my_case_ids(a)) then raise exception 'Not found'; end if;
    if a.role<>'admin' and not (p.from_id=a.id or p.to_target=a.id::text) then raise exception 'Not allowed'; end if;
    if (select count(*) from files where target='post' and target_id=p_target_id) >= 10 then raise exception 'At most 10 files per message.'; end if;
    p_visible := 'office';
  elsif p_target='case' then
    if a.role<>'admin' then raise exception 'Admin only' using errcode='42501'; end if;
    if p_visible not in ('office','patient','staff','both') then p_visible := 'office'; end if;
  elsif p_target='profile' then
    if a.role<>'admin' then raise exception 'Admin only' using errcode='42501'; end if;
    if p_mime !~* '^image/' then raise exception 'The profile picture must be a photo.'; end if;
    delete from files where target='profile' and target_id=p_target_id;
    p_visible := 'both';
  else raise exception 'Not allowed';
  end if;
  insert into files(owner_id,owner_name,owner_role,target,target_id,visible_to,name,mime,size,data)
    values (a.id, a.name, a.role, p_target, p_target_id, p_visible, left(coalesce(nullif(trim(p_name),''),'file'),160), p_mime, length(d), d) returning * into r;
  return json_build_object('id',r.id,'name',r.name,'size',r.size);
end $$;

-- website visitors may add up to 3 files to the inquiry they just sent (within 15 minutes)
create or replace function public.upload_inquiry_file(p_inquiry_id uuid, p_name text, p_mime text, p_b64 text) returns void language plpgsql
  security definer set search_path = public as $$
declare d bytea; i inquiries;
begin
  select * into i from inquiries where id=p_inquiry_id;
  if i.id is null or i.created_at < now()-interval '15 minutes' then raise exception 'Please send the inquiry again to attach files.'; end if;
  if (select count(*) from files where target='inquiry' and target_id=p_inquiry_id::text) >= 3 then raise exception 'At most 3 files per inquiry.'; end if;
  d := _file_ok(p_name, p_mime, p_b64);
  insert into files(owner_name,owner_role,target,target_id,visible_to,name,mime,size,data)
    values (i.name,'visitor','inquiry',p_inquiry_id::text,'office',left(coalesce(nullif(trim(p_name),''),'file'),160),p_mime,length(d),d);
end $$;

create or replace function public.get_file(p_token text, p_id uuid) returns json language plpgsql
  security definer set search_path = public as $$
declare a accounts := _me(p_token); f files; p posts; ok boolean := false;
begin
  select * into f from files where id=p_id; if f.id is null then raise exception 'File not found'; end if;
  if a.role='admin' then ok := true;
  elsif f.target='post' then select * into p from posts where id=f.target_id::uuid; ok := p.id is not null and _can_see(a,p,_my_case_ids(a));
  elsif f.target='case' then ok := f.target_id = any(_my_case_ids(a)) and (f.visible_to='both' or f.visible_to=a.role);
  end if;
  if not ok then raise exception 'Not allowed'; end if;
  return json_build_object('name',f.name,'mime',f.mime,'b64',encode(f.data,'base64'));
end $$;

create or replace function public.delete_file(p_token text, p_id uuid) returns void language plpgsql
  security definer set search_path = public as $$
declare a accounts := _me(p_token);
begin
  delete from files where id=p_id and (a.role='admin' or owner_id=a.id);
end $$;

create or replace function public.admin_set_file(p_token text, p_id uuid, p_visible text) returns void language plpgsql
  security definer set search_path = public as $$
begin perform _admin(p_token);
  if p_visible not in ('office','patient','staff','both') then raise exception 'Bad value'; end if;
  update files set visible_to=p_visible where id=p_id and target='case'; end $$;

-- ------------------------------------------------ nurse profiles & reviews
create or replace function public._case_val(cells jsonb, rx text) returns text language sql immutable as $$
  select value from jsonb_each_text(cells) where key ~* rx limit 1 $$;

-- public: anyone with the QR / link (token optional — a logged-in patient also gets their own review back)
create or replace function public.get_nurse_profile(p_slug text, p_token text default null) returns json language plpgsql
  security definer set search_path = public, extensions as $$
declare x accounts; me accounts; res json; keys text[]; m json;
begin
  select * into x from accounts where public_slug=p_slug and role='staff';
  if x.id is null or not x.active or not coalesce((x.profile->>'public')::boolean,true) then raise exception 'This profile is not available.'; end if;
  if p_token is not null and p_token<>'' then begin me := _me(p_token); exception when others then me := null; end; end if;
  keys := _staff_keys(x);
  with c as (select c.*, _case_val(c.cells,'^status$') st, _case_val(c.cells,'start date') sd, _case_val(c.cells,'end date') ed from cases c where c.staff_keys && keys)
  select json_build_object(
    'patients', (select count(distinct coalesce(nullif(phone10,''),id)) from c where coalesce(st,'') !~* 'enquiry|inquiry|cancel|not availed|not converted'),
    'madeWell', coalesce(nullif(x.profile->>'madeWell','')::int, (select count(*) from c where st ~* 'recover|improv|made well|well|complete')::int),
    'sentHome', coalesce(nullif(x.profile->>'sentHome','')::int, (select count(*) from c where st ~* 'discharg|sent home|home')::int),
    'days', (select coalesce(sum(greatest(0, least(case when ed ~ '^\d{4}-\d{2}-\d{2}$' then ed::date else current_date end, current_date) - sd::date + 1)),0)
             from c where sd ~ '^\d{4}-\d{2}-\d{2}$' and sd::date <= current_date and coalesce(st,'') !~* 'enquiry|inquiry|cancel|not availed|not converted'),
    'ongoing', (select count(*) from c where coalesce(st,'') !~* 'closed|complete|demise|death|deceased|cancel|discharg|expired|not availed|not converted|lost|rejected|enquiry|inquiry|recover|sent home'
                and (ed !~ '^\d{4}-\d{2}-\d{2}$' or ed::date >= current_date) and (sd !~ '^\d{4}-\d{2}-\d{2}$' or sd::date <= current_date))
  ) into m;
  select json_build_object(
    'slug',x.public_slug,'name',x.name,'profile',x.profile - 'madeWell' - 'sentHome','since',coalesce(x.profile->>'workingSince',to_char(x.created_at,'YYYY-MM-DD')),
    'hasPhoto', exists(select 1 from files f where f.target='profile' and f.target_id=x.id::text),
    'metrics', m,
    'rating', (select round(avg(rating)::numeric,1) from reviews where staff_id=x.id and not hidden),
    'ratingCount', (select count(*) from reviews where staff_id=x.id and not hidden),
    'reviews', coalesce((select json_agg(json_build_object('id',r.id,'rating',r.rating,'comment',r.comment,'verified',r.verified,'at',_ms(r.updated_at),
        'by', split_part(p.name,' ',1) || coalesce(' '||nullif(left(split_part(p.name,' ',2),1),'')||'.','')) order by r.updated_at desc)
        from reviews r join accounts p on p.id=r.patient_id where r.staff_id=x.id and not r.hidden and r.comment<>''),'[]'),
    'me', case when me.id is null then null else json_build_object('role',me.role,'name',me.name,'phone',me.phone,
        'myReview',(select json_build_object('rating',r.rating,'comment',r.comment,'hidden',r.hidden) from reviews r where r.staff_id=x.id and r.patient_id=me.id)) end
  ) into res;
  return res;
end $$;

create or replace function public.get_nurse_photo(p_slug text) returns json language sql stable
  security definer set search_path = public as $$
  select json_build_object('mime',f.mime,'b64',encode(f.data,'base64')) from files f join accounts x on f.target='profile' and f.target_id=x.id::text
  where x.public_slug=p_slug and x.active and coalesce((x.profile->>'public')::boolean,true) order by f.created_at desc limit 1 $$;

create or replace function public.submit_review(p_token text, p_slug text, p_rating int, p_comment text) returns void language plpgsql
  security definer set search_path = public as $$
declare a accounts := _me(p_token); x accounts; v boolean;
begin
  if a.role<>'patient' then raise exception 'Only patients can rate nurses. Please log in with your patient account.'; end if;
  select * into x from accounts where public_slug=p_slug and role='staff' and active; if x.id is null then raise exception 'This profile is not available.'; end if;
  if p_rating is null or p_rating<1 or p_rating>5 then raise exception 'Choose 1 to 5 stars.'; end if;
  v := exists(select 1 from cases c where c.id = any(_my_case_ids(a)) and c.staff_keys && _staff_keys(x));
  insert into reviews(staff_id,patient_id,rating,comment,verified) values (x.id,a.id,p_rating,left(trim(coalesce(p_comment,'')),1000),v)
    on conflict (staff_id,patient_id) do update set rating=excluded.rating, comment=excluded.comment, verified=excluded.verified, updated_at=now();
end $$;

create or replace function public.admin_set_review(p_token text, p_id uuid, p_hidden boolean) returns void language plpgsql
  security definer set search_path = public as $$ begin perform _admin(p_token); update reviews set hidden=p_hidden where id=p_id; end $$;
create or replace function public.admin_delete_review(p_token text, p_id uuid) returns void language plpgsql
  security definer set search_path = public as $$ begin perform _admin(p_token); delete from reviews where id=p_id; end $$;

create or replace function public.admin_update_profile(p_token text, p_id uuid, p_profile jsonb) returns void language plpgsql
  security definer set search_path = public as $$
begin perform _admin(p_token);
  update accounts set profile = coalesce(profile,'{}'::jsonb) || coalesce(p_profile,'{}'::jsonb),
    public_slug = coalesce(public_slug, _slug(name)) where id=p_id and role='staff';
end $$;

-- --------------------------------------------------------------- grants
do $$
declare f record; internal boolean;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('_p10','_ms','_pw_ok','_hash','_check','_new_session','_me','_admin','_pub','_staff_keys','_my_case_ids','_can_see','_post_json','_strip',
             'has_admin','create_admin','signup_patient','login','logout','change_password','get_state','add_post','reply_post','mark_read','submit_inquiry',
             'admin_set_post','admin_delete_post','admin_update_inquiry','admin_delete_inquiry','admin_create_staff','admin_update_account','admin_reset_password',
             'admin_delete_account','admin_set_settings','admin_load_board','admin_save_board',
             '_files','_file_ok','upload_file','upload_inquiry_file','get_file','delete_file','admin_set_file',
             '_slug','_case_val','get_nurse_profile','get_nurse_photo','submit_review','admin_set_review','admin_delete_review','admin_update_profile')
  loop
    internal := f.proname like '\_%';
    execute format('revoke all on function %s from public', f.sig);
    if exists(select 1 from pg_roles where rolname='anon') then
      execute format('revoke all on function %s from anon, authenticated', f.sig);
      if not internal then execute format('grant execute on function %s to anon, authenticated', f.sig); end if;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
