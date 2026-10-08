-- Daily Wins database schema
-- Run once in the Supabase SQL Editor for a fresh project.

create table if not exists public.daily_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day_date date not null,
  goals jsonb not null default '[]'::jsonb,
  frozen_at timestamptz,
  manually_won boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day_date),
  constraint daily_days_goals_array check (jsonb_typeof(goals) = 'array'),
  constraint daily_days_goal_count check (
    jsonb_array_length(goals) between 0 and 5
    and (frozen_at is null or jsonb_array_length(goals) = 5)
  )
);

alter table public.daily_days add column if not exists manually_won boolean not null default false;

alter table public.daily_days enable row level security;

drop policy if exists "Users can read and write their own days" on public.daily_days;
create policy "Users can read and write their own days"
  on public.daily_days
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.daily_days from anon, authenticated;
grant select, insert, update on table public.daily_days to authenticated;

create or replace function public.daily_wins_guard_day()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  goal_count integer;
  goal_index integer;
  goal_value jsonb;
  goal_id text;
  seen_ids text[] := array[]::text[];
begin
  if tg_op = 'DELETE' then
    raise exception 'Daily Wins day records cannot be deleted';
  end if;

  if jsonb_typeof(new.goals) is distinct from 'array' then
    raise exception 'Goals must be a JSON array';
  end if;
  goal_count := jsonb_array_length(new.goals);

  if new.frozen_at is not null and goal_count <> 5 then
    raise exception 'A frozen day must contain exactly five goals';
  end if;
  if new.manually_won and new.frozen_at is null then
    raise exception 'Only a planned day can be marked manually won';
  end if;

  for goal_index in 0..(goal_count - 1) loop
    goal_value := new.goals -> goal_index;
    if jsonb_typeof(goal_value) is distinct from 'object'
       or not (goal_value ?& array['id', 'text', 'category', 'done'])
       or (select count(*) from pg_catalog.jsonb_object_keys(goal_value)) <> 4
       or jsonb_typeof(goal_value -> 'id') is distinct from 'string'
       or jsonb_typeof(goal_value -> 'text') is distinct from 'string'
       or jsonb_typeof(goal_value -> 'category') is distinct from 'string'
       or jsonb_typeof(goal_value -> 'done') is distinct from 'boolean' then
      raise exception 'Each goal must contain only id, text, category, and done';
    end if;
    goal_id := goal_value ->> 'id';
    if goal_id is null or btrim(goal_id) = ''
       or goal_value ->> 'text' is null or btrim(goal_value ->> 'text') = ''
       or goal_value ->> 'category' not in ('Zdrowie', 'Konto', 'Duch')
       or goal_value ->> 'done' not in ('true', 'false') then
      raise exception 'Goal data is invalid';
    end if;
    if goal_id = any(seen_ids) then
      raise exception 'Goal ids must be unique within a day';
    end if;
    seen_ids := pg_catalog.array_append(seen_ids, goal_id);
  end loop;

  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or new.day_date is distinct from old.day_date then
      raise exception 'A day owner and date are immutable';
    end if;
    if old.manually_won and not new.manually_won then
      raise exception 'A manual win cannot be undone';
    end if;
    if old.frozen_at is not null then
      if new.frozen_at is distinct from old.frozen_at
         and not (old.day_date > current_date and new.frozen_at is null) then
        raise exception 'A frozen day cannot be unfrozen';
      end if;
      if not (old.day_date > current_date and new.frozen_at is null) then
        for goal_index in 0..4 loop
          if new.goals -> goal_index ->> 'id' is distinct from old.goals -> goal_index ->> 'id'
             or new.goals -> goal_index ->> 'text' is distinct from old.goals -> goal_index ->> 'text'
             or new.goals -> goal_index ->> 'category' is distinct from old.goals -> goal_index ->> 'category' then
            raise exception 'Frozen goal definitions are immutable';
          end if;
        end loop;
      end if;
    end if;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists daily_wins_guard_day on public.daily_days;
create trigger daily_wins_guard_day
  before insert or update or delete on public.daily_days
  for each row execute function public.daily_wins_guard_day();
