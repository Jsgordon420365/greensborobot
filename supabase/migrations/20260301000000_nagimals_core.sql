-- =============================================================================
-- Nagimals core schema
--
-- Idempotent: safe to run repeatedly against the same project.
--
-- Row Level Security is on for every table and every policy is owner-scoped.
-- The anon key can therefore be shipped to the browser safely: a signed-in
-- user can only ever reach their own household. The service-role key is never
-- used by client code and belongs only in Edge Function secrets.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------- enums ----

do $$
begin
  if not exists (select 1 from pg_type where typname = 'nagimal_species') then
    create type nagimal_species as enum ('dog', 'cat', 'plant');
  end if;
  if not exists (select 1 from pg_type where typname = 'para_class') then
    create type para_class as enum ('project', 'area', 'resource', 'archive');
  end if;
  if not exists (select 1 from pg_type where typname = 'responsibility_status') then
    create type responsibility_status as enum ('active', 'snoozed', 'completed', 'dormant', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'importance_level') then
    create type importance_level as enum ('low', 'normal', 'high', 'critical');
  end if;
  if not exists (select 1 from pg_type where typname = 'reminder_intensity') then
    create type reminder_intensity as enum ('gentle', 'standard', 'firm');
  end if;
  if not exists (select 1 from pg_type where typname = 'communication_style') then
    create type communication_style as enum ('calm', 'encouraging', 'direct');
  end if;
end$$;

-- ------------------------------------------------------ updated_at trigger --

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------- profiles ----

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Resident',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ households ----

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Home',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint households_name_not_blank check (length(btrim(name)) > 0)
);

create index if not exists households_owner_idx on public.households(owner_id);

-- ------------------------------------------------------------- nagimals ----

create table if not exists public.nagimals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  species nagimal_species not null,
  appearance_variant text not null default 'default',
  communication_style communication_style not null default 'calm',
  role text not null default '',
  base_state text not null default 'resting',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nagimals_name_not_blank check (length(btrim(name)) > 0)
);

create index if not exists nagimals_household_idx on public.nagimals(household_id);
create index if not exists nagimals_owner_idx on public.nagimals(owner_id);

-- ------------------------------------------------------- responsibilities --

create table if not exists public.responsibilities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  nagimal_id uuid references public.nagimals(id) on delete set null,
  title text not null,
  description text,
  para_class para_class not null default 'project',
  status responsibility_status not null default 'active',
  importance importance_level not null default 'normal',
  reminder_intensity reminder_intensity not null default 'standard',
  deadline_at timestamptz,
  expected_attention_interval_minutes integer,
  last_attention_at timestamptz,
  next_commitment_at timestamptz,
  snooze_count integer not null default 0,
  quiet_hours jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint responsibilities_title_not_blank check (length(btrim(title)) > 0),
  constraint responsibilities_snooze_count_non_negative check (snooze_count >= 0),
  constraint responsibilities_interval_positive
    check (expected_attention_interval_minutes is null or expected_attention_interval_minutes > 0),
  -- An Area or plant responsibility is meaningless without an interval to
  -- measure neglect against; the engine says so, and so does the database.
  constraint responsibilities_area_needs_interval
    check (para_class <> 'area' or expected_attention_interval_minutes is not null)
);

create index if not exists responsibilities_household_idx on public.responsibilities(household_id);
create index if not exists responsibilities_owner_idx on public.responsibilities(owner_id);
create index if not exists responsibilities_nagimal_idx on public.responsibilities(nagimal_id);
-- The scheduled notification sweep reads exactly this slice.
create index if not exists responsibilities_active_deadline_idx
  on public.responsibilities(deadline_at)
  where status in ('active', 'snoozed') and para_class = 'project';
create index if not exists responsibilities_active_attention_idx
  on public.responsibilities(last_attention_at)
  where status in ('active', 'snoozed') and para_class = 'area';

-- ------------------------------------------------- nagimal_state_snapshots --

create table if not exists public.nagimal_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  nagimal_id uuid not null references public.nagimals(id) on delete cascade,
  responsibility_id uuid references public.responsibilities(id) on delete cascade,
  stage smallint not null,
  state text not null,
  animation text not null default '',
  message text not null default '',
  sound text,
  should_notify boolean not null default false,
  intervening_for uuid references public.nagimals(id) on delete set null,
  reasons jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  next_evaluation_at timestamptz,

  constraint snapshots_stage_range check (stage between 0 and 4)
);

create index if not exists snapshots_nagimal_idx
  on public.nagimal_state_snapshots(nagimal_id, evaluated_at desc);

-- -------------------------------------------------------- household_events --

create table if not exists public.household_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  nagimal_id uuid references public.nagimals(id) on delete set null,
  responsibility_id uuid references public.responsibilities(id) on delete set null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists household_events_owner_idx
  on public.household_events(owner_id, created_at desc);
-- Notification cooldown lookups hit this index.
create index if not exists household_events_notifications_idx
  on public.household_events(responsibility_id, created_at desc)
  where event_type = 'notification_sent';

-- ------------------------------------------------------ push_subscriptions --

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_owner_idx
  on public.push_subscriptions(owner_id) where revoked_at is null;

-- ------------------------------------------------------ earned_accessories --

create table if not exists public.earned_accessories (
  id uuid primary key default gen_random_uuid(),
  nagimal_id uuid not null references public.nagimals(id) on delete cascade,
  accessory_key text not null,
  earned_reason text not null default '',
  earned_at timestamptz not null default now(),
  equipped boolean not null default true,
  -- A keepsake is earned once. Finishing twice does not stack the same pin.
  constraint earned_accessories_unique unique (nagimal_id, accessory_key)
);

create index if not exists earned_accessories_nagimal_idx
  on public.earned_accessories(nagimal_id);

-- ------------------------------------------------------------- triggers ----

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'households', 'nagimals', 'responsibilities', 'push_subscriptions']
  loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end$$;

-- ---------------------------------------------------------------- RLS ------

alter table public.profiles              enable row level security;
alter table public.households            enable row level security;
alter table public.nagimals              enable row level security;
alter table public.responsibilities      enable row level security;
alter table public.nagimal_state_snapshots enable row level security;
alter table public.household_events      enable row level security;
alter table public.push_subscriptions    enable row level security;
alter table public.earned_accessories    enable row level security;

-- Owner-only policies. Each is dropped first so the migration stays idempotent.

drop policy if exists "profiles are self-service" on public.profiles;
create policy "profiles are self-service" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "households are owner-only" on public.households;
create policy "households are owner-only" on public.households
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "nagimals are owner-only" on public.nagimals;
create policy "nagimals are owner-only" on public.nagimals
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "responsibilities are owner-only" on public.responsibilities;
create policy "responsibilities are owner-only" on public.responsibilities
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "events are owner-only" on public.household_events;
create policy "events are owner-only" on public.household_events
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "push subscriptions are owner-only" on public.push_subscriptions;
create policy "push subscriptions are owner-only" on public.push_subscriptions
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Snapshots and accessories hang off a Nagimal, so ownership is checked through it.

drop policy if exists "snapshots follow their nagimal" on public.nagimal_state_snapshots;
create policy "snapshots follow their nagimal" on public.nagimal_state_snapshots
  for all to authenticated
  using (
    exists (
      select 1 from public.nagimals n
      where n.id = nagimal_state_snapshots.nagimal_id
        and n.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.nagimals n
      where n.id = nagimal_state_snapshots.nagimal_id
        and n.owner_id = (select auth.uid())
    )
  );

drop policy if exists "accessories follow their nagimal" on public.earned_accessories;
create policy "accessories follow their nagimal" on public.earned_accessories
  for all to authenticated
  using (
    exists (
      select 1 from public.nagimals n
      where n.id = earned_accessories.nagimal_id
        and n.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.nagimals n
      where n.id = earned_accessories.nagimal_id
        and n.owner_id = (select auth.uid())
    )
  );

-- --------------------------------------------------- profile bootstrapping --

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Resident'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------- realtime ----

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Adding a table twice raises; ignore that specific case.
    begin
      alter publication supabase_realtime add table public.responsibilities;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.nagimal_state_snapshots;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.earned_accessories;
    exception when duplicate_object then null;
    end;
  end if;
end$$;

-- ------------------------------------------------------ demo seed helper ----

/**
 * Seeds "The Fern, the Cat and the Deadline" for the calling user.
 *
 * security invoker, so RLS still applies: it can only ever seed the caller's
 * own household. Returns the new household id.
 */
create or replace function public.seed_demo_household(
  p_dog_name text default 'Bear',
  p_dog_variant text default 'bear'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_household uuid;
  v_dog uuid;
  v_cat uuid;
  v_fern uuid;
begin
  if v_owner is null then
    raise exception 'seed_demo_household requires an authenticated caller';
  end if;

  insert into public.households (owner_id, name)
  values (v_owner, 'The Household')
  returning id into v_household;

  insert into public.nagimals (household_id, owner_id, name, species, appearance_variant, communication_style, role, base_state)
  values (v_household, v_owner, p_dog_name, 'dog', p_dog_variant, 'calm', 'deadline guardian', 'resting')
  returning id into v_dog;

  insert into public.nagimals (household_id, owner_id, name, species, appearance_variant, communication_style, role, base_state)
  values (v_household, v_owner, 'Juniper', 'cat', 'calico', 'direct', 'persistent attention broker and household intermediary', 'lounging')
  returning id into v_cat;

  insert into public.nagimals (household_id, owner_id, name, species, appearance_variant, communication_style, role, base_state)
  values (v_household, v_owner, 'Frondly', 'plant', 'boston_fern', 'calm', 'long-term and low-frequency responsibility', 'healthy')
  returning id into v_fern;

  insert into public.responsibilities
    (household_id, owner_id, nagimal_id, title, description, para_class, importance, reminder_intensity, deadline_at, last_attention_at)
  values
    (v_household, v_owner, v_dog, 'Submit the Nagimals proof-of-concept',
     'The deliverable Bear is guarding. Three days out at the start of the scenario.',
     'project', 'high', 'standard', now() + interval '3 days', now() - interval '2 hours');

  insert into public.responsibilities
    (household_id, owner_id, nagimal_id, title, description, para_class, importance, reminder_intensity,
     expected_attention_interval_minutes, last_attention_at)
  values
    (v_household, v_owner, v_cat, 'Weekly project review',
     'An ongoing Area with no completion state. Juniper keeps an eye on it.',
     'area', 'normal', 'gentle', 10080, now() - interval '1 day'),
    (v_household, v_owner, v_fern, 'Revisit the neglected prototype notes',
     'The shipwreck at the bottom of the sea. Frondly stands for it so it stays visible.',
     'area', 'normal', 'standard', 10080, now() - interval '6 days');

  insert into public.household_events (household_id, owner_id, event_type, event_payload)
  values (v_household, v_owner, 'household_created',
          jsonb_build_object('seed', 'the-fern-the-cat-and-the-deadline', 'dogVariant', p_dog_variant));

  return v_household;
end;
$$;

grant execute on function public.seed_demo_household(text, text) to authenticated;
