-- Phase 5: Scheduling
-- Adds games table, RLS policies, RPC functions for schedule management,
-- round-robin generation, and field conflict detection.

-- ============================================
-- GAME STATUS ENUM
-- ============================================
create type game_status as enum ('scheduled', 'in_progress', 'final', 'cancelled', 'postponed');

-- ============================================
-- GAMES TABLE
-- ============================================
create table games (
  id uuid primary key default uuid_generate_v4(),
  league_id uuid not null references leagues(id) on delete cascade,
  home_team_id uuid not null references teams(id) on delete cascade,
  away_team_id uuid not null references teams(id) on delete cascade,
  field_id uuid references fields(id) on delete set null,
  diamond_number integer,
  scheduled_at timestamptz not null,
  status game_status not null default 'scheduled',
  home_score integer not null default 0,
  away_score integer not null default 0,
  inning integer,
  inning_half text,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint different_teams check (home_team_id != away_team_id)
);

create trigger games_updated_at before update on games
  for each row execute function update_updated_at();

-- Indexes
create index idx_games_league_id on games(league_id);
create index idx_games_home_team_id on games(home_team_id);
create index idx_games_away_team_id on games(away_team_id);
create index idx_games_field_id on games(field_id);
create index idx_games_scheduled_at on games(scheduled_at);
create index idx_games_field_diamond_time on games(field_id, diamond_number, scheduled_at)
  where field_id is not null;

-- ============================================
-- RLS POLICIES (split — never use FOR ALL)
-- ============================================
alter table games enable row level security;

-- SELECT: Any authenticated user in the same league can view games
create policy "Games viewable by league members"
  on games for select
  to authenticated
  using (
    exists (
      select 1 from user_roles ur
      where ur.league_id = games.league_id
        and ur.user_id = auth.uid()
    )
  );

-- INSERT: Commissioner or manager of the league
create policy "Commissioners/managers can insert games"
  on games for insert
  to authenticated
  with check (
    exists (
      select 1 from user_roles ur
      where ur.league_id = games.league_id
        and ur.user_id = auth.uid()
        and ur.role in ('commissioner', 'manager')
    )
  );

-- UPDATE: Commissioner or manager of the league
create policy "Commissioners/managers can update games"
  on games for update
  to authenticated
  using (
    exists (
      select 1 from user_roles ur
      where ur.league_id = games.league_id
        and ur.user_id = auth.uid()
        and ur.role in ('commissioner', 'manager')
    )
  );

-- DELETE: Commissioner only
create policy "Commissioners can delete games"
  on games for delete
  to authenticated
  using (
    exists (
      select 1 from user_roles ur
      where ur.league_id = games.league_id
        and ur.user_id = auth.uid()
        and ur.role = 'commissioner'
    )
  );

-- ============================================
-- HELPER: check_field_conflict
-- ============================================
-- Returns true if there is a scheduling conflict on the given field/diamond/time.
-- A conflict is any other game on the same field+diamond within 2 hours.

create or replace function check_field_conflict(
  p_field_id uuid,
  p_diamond_number integer,
  p_scheduled_at timestamptz,
  p_exclude_game_id uuid default null
)
returns boolean as $$
begin
  if p_field_id is null then
    return false;
  end if;

  return exists (
    select 1 from games g
    where g.field_id = p_field_id
      and coalesce(g.diamond_number, 1) = coalesce(p_diamond_number, 1)
      and g.status not in ('cancelled', 'postponed')
      and g.scheduled_at between p_scheduled_at - interval '2 hours'
                              and p_scheduled_at + interval '2 hours'
      and (p_exclude_game_id is null or g.id != p_exclude_game_id)
  );
end;
$$ language plpgsql;

-- ============================================
-- RPC: create_game
-- ============================================
create or replace function create_game(
  p_league_id uuid,
  p_home_team_id uuid,
  p_away_team_id uuid,
  p_field_id uuid default null,
  p_diamond_number integer default null,
  p_scheduled_at timestamptz default null,
  p_notes text default null
)
returns json as $$
declare
  v_is_authorized boolean;
  v_field record;
  v_new_id uuid;
begin
  -- Verify caller is commissioner or manager
  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = p_league_id
      and role in ('commissioner', 'manager')
  ) into v_is_authorized;

  if not v_is_authorized then
    raise exception 'You are not authorized to create games in this league.';
  end if;

  -- Verify home team is in the league
  if not exists (select 1 from teams where id = p_home_team_id and league_id = p_league_id) then
    raise exception 'Home team does not belong to this league.';
  end if;

  -- Verify away team is in the league
  if not exists (select 1 from teams where id = p_away_team_id and league_id = p_league_id) then
    raise exception 'Away team does not belong to this league.';
  end if;

  -- Teams must be different
  if p_home_team_id = p_away_team_id then
    raise exception 'Home and away teams must be different.';
  end if;

  -- Validate field if provided
  if p_field_id is not null then
    select * into v_field from fields where id = p_field_id;
    if v_field is null then
      raise exception 'Field not found.';
    end if;
    if v_field.league_id != p_league_id then
      raise exception 'Field does not belong to this league.';
    end if;
    if p_diamond_number is not null and p_diamond_number > v_field.diamond_count then
      raise exception 'Diamond number % exceeds the field''s diamond count of %.', p_diamond_number, v_field.diamond_count;
    end if;

    -- Check for field conflicts
    if check_field_conflict(p_field_id, p_diamond_number, p_scheduled_at) then
      raise exception 'Field conflict: another game is already scheduled on this diamond within 2 hours of the requested time.';
    end if;
  end if;

  -- Insert the game
  insert into games (league_id, home_team_id, away_team_id, field_id, diamond_number, scheduled_at, notes)
  values (p_league_id, p_home_team_id, p_away_team_id, p_field_id, p_diamond_number, p_scheduled_at, p_notes)
  returning id into v_new_id;

  return json_build_object('id', v_new_id);
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: update_game
-- ============================================
create or replace function update_game(
  p_game_id uuid,
  p_field_id uuid default null,
  p_diamond_number integer default null,
  p_scheduled_at timestamptz default null,
  p_notes text default null,
  p_status text default null,
  p_clear_field boolean default false,
  p_clear_notes boolean default false
)
returns json as $$
declare
  v_game record;
  v_is_authorized boolean;
  v_field record;
  v_status game_status;
  v_final_field_id uuid;
  v_final_diamond integer;
  v_final_scheduled_at timestamptz;
begin
  select * into v_game from games where id = p_game_id;
  if v_game is null then
    raise exception 'Game not found.';
  end if;

  -- Verify caller is commissioner or manager
  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = v_game.league_id
      and role in ('commissioner', 'manager')
  ) into v_is_authorized;

  if not v_is_authorized then
    raise exception 'You are not authorized to update this game.';
  end if;

  -- Determine final field values
  if p_clear_field then
    v_final_field_id := null;
    v_final_diamond := null;
  else
    v_final_field_id := coalesce(p_field_id, v_game.field_id);
    v_final_diamond := case
      when p_diamond_number is not null then p_diamond_number
      when p_field_id is not null and p_field_id != v_game.field_id then null
      else v_game.diamond_number
    end;
  end if;

  v_final_scheduled_at := coalesce(p_scheduled_at, v_game.scheduled_at);

  -- Validate field if set
  if v_final_field_id is not null then
    select * into v_field from fields where id = v_final_field_id;
    if v_field is null then
      raise exception 'Field not found.';
    end if;
    if v_field.league_id != v_game.league_id then
      raise exception 'Field does not belong to this league.';
    end if;
    if v_final_diamond is not null and v_final_diamond > v_field.diamond_count then
      raise exception 'Diamond number exceeds the field''s diamond count.';
    end if;

    -- Check for field conflicts (exclude self)
    if (v_final_field_id is distinct from v_game.field_id
        or v_final_diamond is distinct from v_game.diamond_number
        or v_final_scheduled_at is distinct from v_game.scheduled_at)
    then
      if check_field_conflict(v_final_field_id, v_final_diamond, v_final_scheduled_at, p_game_id) then
        raise exception 'Field conflict: another game is already scheduled on this diamond within 2 hours of the requested time.';
      end if;
    end if;
  end if;

  -- Cast status if provided
  if p_status is not null then
    v_status := p_status::game_status;
  end if;

  update games
  set
    field_id = v_final_field_id,
    diamond_number = v_final_diamond,
    scheduled_at = v_final_scheduled_at,
    notes = case
      when p_clear_notes then null
      when p_notes is not null then p_notes
      else notes
    end,
    status = coalesce(v_status, games.status)
  where id = p_game_id;

  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: update_game_status
-- ============================================
create or replace function update_game_status(
  p_game_id uuid,
  p_status text,
  p_home_score integer default null,
  p_away_score integer default null
)
returns json as $$
declare
  v_game record;
  v_is_authorized boolean;
  v_status game_status;
begin
  select * into v_game from games where id = p_game_id;
  if v_game is null then
    raise exception 'Game not found.';
  end if;

  -- Verify caller is commissioner, manager, or coach of either team
  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = v_game.league_id
      and (
        role in ('commissioner', 'manager')
        or (role = 'coach' and team_id in (v_game.home_team_id, v_game.away_team_id))
      )
  ) into v_is_authorized;

  if not v_is_authorized then
    raise exception 'You are not authorized to update this game''s status.';
  end if;

  v_status := p_status::game_status;

  update games
  set
    status = v_status,
    home_score = coalesce(p_home_score, home_score),
    away_score = coalesce(p_away_score, away_score)
  where id = p_game_id;

  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: get_league_schedule
-- ============================================
create or replace function get_league_schedule(
  p_league_id uuid,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null
)
returns table(
  game_id uuid,
  league_id uuid,
  league_name text,
  home_team_id uuid,
  home_team_name text,
  home_team_color text,
  away_team_id uuid,
  away_team_name text,
  away_team_color text,
  field_id uuid,
  field_name text,
  diamond_number integer,
  scheduled_at timestamptz,
  status text,
  home_score integer,
  away_score integer,
  inning integer,
  inning_half text,
  notes text,
  created_at timestamptz
) as $$
begin
  -- Verify caller is in the league
  if not exists (
    select 1 from user_roles ur
    where ur.league_id = p_league_id
      and ur.user_id = auth.uid()
  ) then
    raise exception 'You do not have access to this league.';
  end if;

  return query
  select
    g.id as game_id,
    g.league_id,
    l.name as league_name,
    g.home_team_id,
    ht.name as home_team_name,
    ht.color as home_team_color,
    g.away_team_id,
    at.name as away_team_name,
    at.color as away_team_color,
    g.field_id,
    f.name as field_name,
    g.diamond_number,
    g.scheduled_at,
    g.status::text,
    g.home_score,
    g.away_score,
    g.inning,
    g.inning_half,
    g.notes,
    g.created_at
  from games g
  join leagues l on l.id = g.league_id
  join teams ht on ht.id = g.home_team_id
  join teams at on at.id = g.away_team_id
  left join fields f on f.id = g.field_id
  where g.league_id = p_league_id
    and (p_from_date is null or g.scheduled_at >= p_from_date)
    and (p_to_date is null or g.scheduled_at <= p_to_date)
  order by g.scheduled_at;
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: generate_round_robin
-- ============================================
-- Generates a balanced round-robin schedule using the circle method.
-- Each team plays every other team p_rounds times.
--
-- p_game_dates: Array of specific dates (as text 'YYYY-MM-DD') when games
--               should be scheduled. Provides full calendar control —
--               the caller picks exact dates via a UI calendar.
-- p_time_slots: Array of times (as text 'HH:MM') for each game slot per date.
--               Multiple time slots allow multiple games per date.

create or replace function generate_round_robin(
  p_league_id uuid,
  p_team_ids uuid[],
  p_game_dates text[],
  p_time_slots text[] default '{18:00}',
  p_field_id text default null,
  p_rounds integer default 1
)
returns json as $$
declare
  v_is_authorized boolean;
  v_n integer;
  v_teams uuid[];
  v_matchups record;
  v_home uuid;
  v_away uuid;
  v_temp uuid;
  v_idx_a integer;
  v_idx_b integer;
  v_round integer;
  v_day integer;
  v_match integer;
  v_games_created integer := 0;
  v_total_matchups integer;
  v_sorted_dates date[];
  v_num_dates integer;
  v_date_idx integer;
  v_slot_idx integer;
  v_num_slots integer;
  v_scheduled_at timestamptz;
  v_slot_time time;
  v_field_uuid uuid;
begin
  -- Cast field_id from text to uuid (avoids PostgREST type-resolution issues)
  v_field_uuid := case
    when p_field_id is not null and p_field_id != '' then p_field_id::uuid
    else null
  end;

  -- Verify caller is commissioner
  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = p_league_id
      and role = 'commissioner'
  ) into v_is_authorized;

  if not v_is_authorized then
    raise exception 'Only commissioners can generate schedules.';
  end if;

  v_n := array_length(p_team_ids, 1);

  if v_n is null or v_n < 2 then
    raise exception 'At least 2 teams are required to generate a schedule.';
  end if;

  -- Sort and cast the provided date strings to date[]
  v_sorted_dates := (select array_agg(d::date order by d::date) from unnest(p_game_dates) as d);
  v_num_dates := coalesce(array_length(v_sorted_dates, 1), 0);

  if v_num_dates < 1 then
    raise exception 'At least one game date is required.';
  end if;

  v_num_slots := coalesce(array_length(p_time_slots, 1), 0);
  if v_num_slots < 1 then
    raise exception 'At least one time slot is required.';
  end if;

  -- Verify all teams belong to the league
  if exists (
    select 1 from unnest(p_team_ids) tid
    where not exists (select 1 from teams where id = tid and league_id = p_league_id)
  ) then
    raise exception 'One or more teams do not belong to this league.';
  end if;

  -- Validate field if provided
  if v_field_uuid is not null then
    if not exists (select 1 from fields where id = v_field_uuid and league_id = p_league_id) then
      raise exception 'Field does not belong to this league.';
    end if;
  end if;

  -- Build working array; add BYE (NULL) if odd number of teams
  v_teams := p_team_ids;
  if v_n % 2 = 1 then
    v_teams := v_teams || null::uuid;
    v_n := v_n + 1;
  end if;

  -- Phase 1: Generate all matchups using circle method into a temp table
  create temp table _rr_matchups (idx serial, home_id uuid, away_id uuid) on commit drop;

  for v_round in 1..p_rounds loop
    for v_day in 0..(v_n - 2) loop
      for v_match in 0..((v_n / 2) - 1) loop
        if v_match = 0 then
          v_idx_a := 1;
          v_idx_b := 2 + ((v_day + v_n - 2) % (v_n - 1));
        else
          v_idx_a := 2 + ((v_day + v_match - 1) % (v_n - 1));
          v_idx_b := 2 + ((v_day + v_n - 2 - v_match) % (v_n - 1));
        end if;

        v_home := v_teams[v_idx_a];
        v_away := v_teams[v_idx_b];

        if v_home is not null and v_away is not null then
          if v_round % 2 = 0 then
            v_temp := v_home;
            v_home := v_away;
            v_away := v_temp;
          end if;

          insert into _rr_matchups (home_id, away_id) values (v_home, v_away);
        end if;
      end loop;
    end loop;
  end loop;

  select count(*) into v_total_matchups from _rr_matchups;

  -- Verify we have enough date × slot combinations
  if v_total_matchups > v_num_dates * v_num_slots then
    raise exception 'Not enough game dates. Need at least % dates with % time slot(s) to fit % games.',
      ceil(v_total_matchups::numeric / v_num_slots), v_num_slots, v_total_matchups;
  end if;

  -- Phase 2: Distribute matchups across sorted dates × time slots
  v_date_idx := 1;
  v_slot_idx := 1;

  for v_matchups in select home_id, away_id from _rr_matchups order by idx loop
    v_slot_time := p_time_slots[v_slot_idx]::time;
    v_scheduled_at := v_sorted_dates[v_date_idx] + v_slot_time;

    insert into games (league_id, home_team_id, away_team_id, field_id, scheduled_at)
    values (p_league_id, v_matchups.home_id, v_matchups.away_id, v_field_uuid, v_scheduled_at);

    v_games_created := v_games_created + 1;
    v_slot_idx := v_slot_idx + 1;

    if v_slot_idx > v_num_slots then
      v_slot_idx := 1;
      v_date_idx := v_date_idx + 1;
    end if;
  end loop;

  drop table if exists _rr_matchups;

  return json_build_object('games_created', v_games_created);
end;
$$ language plpgsql security definer;
