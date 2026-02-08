-- Phase 6A: Live Scoring Foundation
-- Adds scorekeeper assignments, game lineups, play-by-play events,
-- scorekeeper messages, RLS policies, and RPC functions.

-- ============================================
-- ENUMS
-- ============================================

create type play_outcome as enum (
  'single', 'double', 'triple', 'home_run',
  'groundout', 'flyout', 'lineout', 'pop_out',
  'strikeout_swinging', 'strikeout_looking',
  'walk', 'intentional_walk', 'hit_by_pitch',
  'error', 'fielders_choice',
  'sacrifice_fly', 'sacrifice_bunt',
  'double_play', 'triple_play',
  'stolen_base', 'caught_stealing',
  'wild_pitch', 'passed_ball', 'balk', 'picked_off',
  'runner_advance', 'other'
);

create type consensus_status as enum (
  'pending', 'agreed', 'disputed', 'flagged', 'resolved'
);

-- ============================================
-- SCOREKEEPER ASSIGNMENTS
-- ============================================

create table scorekeeper_assignments (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz default now() not null,
  unique(game_id, team_id)
);

create index idx_sk_assignments_game on scorekeeper_assignments(game_id);

-- ============================================
-- GAME LINEUPS
-- ============================================

create table game_lineups (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  player_user_id uuid not null references auth.users(id) on delete cascade,
  batting_order integer not null,
  fielding_position integer not null,
  is_substitute boolean not null default false,
  entered_inning integer,
  exited_inning integer,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create trigger game_lineups_updated_at before update on game_lineups
  for each row execute function update_updated_at();

-- Partial unique indexes for active lineup slots
create unique index idx_lineup_active_slot
  on game_lineups(game_id, team_id, batting_order)
  where exited_inning is null;

create unique index idx_lineup_active_player
  on game_lineups(game_id, team_id, player_user_id)
  where exited_inning is null;

create index idx_lineups_game on game_lineups(game_id, team_id);

-- ============================================
-- GAME EVENTS (play-by-play)
-- ============================================

create table game_events (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  inning integer not null,
  inning_half text not null check (inning_half in ('top', 'bottom')),
  sequence_number integer not null,

  -- Who
  batter_user_id uuid references auth.users(id),
  pitcher_user_id uuid references auth.users(id),

  -- What
  outcome play_outcome not null,
  hit_location integer,
  fielding_sequence text,

  -- Game state
  outs_before integer not null default 0,
  outs_after integer not null default 0,
  runs_scored integer not null default 0,
  runners_before jsonb not null default '{"first":null,"second":null,"third":null}',
  runners_after jsonb not null default '{"first":null,"second":null,"third":null}',
  runner_movements jsonb,

  -- Pitch tracking
  pitch_count_at_event integer,
  balls integer,
  strikes integer,

  -- Dual scorekeeper
  recorded_by uuid references auth.users(id),
  partner_outcome play_outcome,
  partner_recorded_by uuid references auth.users(id),
  consensus consensus_status not null default 'pending',

  -- Video sync
  video_timestamp_seconds integer,

  notes text,
  is_deleted boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create trigger game_events_updated_at before update on game_events
  for each row execute function update_updated_at();

create index idx_events_game on game_events(game_id, sequence_number);
create index idx_events_inning on game_events(game_id, inning, inning_half);
create index idx_events_consensus on game_events(game_id, consensus)
  where consensus != 'agreed';

-- ============================================
-- SCOREKEEPER MESSAGES
-- ============================================

create table scorekeeper_messages (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references games(id) on delete cascade,
  event_id uuid references game_events(id) on delete set null,
  sender_user_id uuid not null references auth.users(id),
  message text not null,
  created_at timestamptz default now() not null
);

create index idx_sk_messages_game on scorekeeper_messages(game_id);
create index idx_sk_messages_event on scorekeeper_messages(event_id);

-- ============================================
-- RLS POLICIES — scorekeeper_assignments
-- ============================================
alter table scorekeeper_assignments enable row level security;

create policy "SK assignments viewable by league members"
  on scorekeeper_assignments for select to authenticated
  using (
    exists (
      select 1 from games g
      join user_roles ur on ur.league_id = g.league_id and ur.user_id = auth.uid()
      where g.id = scorekeeper_assignments.game_id
    )
  );

create policy "Managers/commissioners can insert SK assignments"
  on scorekeeper_assignments for insert to authenticated
  with check (
    exists (
      select 1 from games g
      join user_roles ur on ur.league_id = g.league_id
        and ur.user_id = auth.uid()
        and ur.role in ('commissioner', 'manager')
      where g.id = scorekeeper_assignments.game_id
    )
  );

create policy "Managers/commissioners can update SK assignments"
  on scorekeeper_assignments for update to authenticated
  using (
    exists (
      select 1 from games g
      join user_roles ur on ur.league_id = g.league_id
        and ur.user_id = auth.uid()
        and ur.role in ('commissioner', 'manager')
      where g.id = scorekeeper_assignments.game_id
    )
  );

create policy "Managers/commissioners can delete SK assignments"
  on scorekeeper_assignments for delete to authenticated
  using (
    exists (
      select 1 from games g
      join user_roles ur on ur.league_id = g.league_id
        and ur.user_id = auth.uid()
        and ur.role in ('commissioner', 'manager')
      where g.id = scorekeeper_assignments.game_id
    )
  );

-- ============================================
-- RLS POLICIES — game_lineups
-- ============================================
alter table game_lineups enable row level security;

create policy "Lineups viewable by league members"
  on game_lineups for select to authenticated
  using (
    exists (
      select 1 from games g
      join user_roles ur on ur.league_id = g.league_id and ur.user_id = auth.uid()
      where g.id = game_lineups.game_id
    )
  );

create policy "Authorized users can insert lineups"
  on game_lineups for insert to authenticated
  with check (
    exists (
      select 1 from games g
      join user_roles ur on ur.league_id = g.league_id
        and ur.user_id = auth.uid()
        and ur.role in ('commissioner', 'manager', 'coach')
      where g.id = game_lineups.game_id
    )
    or exists (
      select 1 from scorekeeper_assignments sa
      where sa.game_id = game_lineups.game_id and sa.user_id = auth.uid()
    )
  );

create policy "Authorized users can update lineups"
  on game_lineups for update to authenticated
  using (
    exists (
      select 1 from games g
      join user_roles ur on ur.league_id = g.league_id
        and ur.user_id = auth.uid()
        and ur.role in ('commissioner', 'manager', 'coach')
      where g.id = game_lineups.game_id
    )
    or exists (
      select 1 from scorekeeper_assignments sa
      where sa.game_id = game_lineups.game_id and sa.user_id = auth.uid()
    )
  );

create policy "Authorized users can delete lineups"
  on game_lineups for delete to authenticated
  using (
    exists (
      select 1 from games g
      join user_roles ur on ur.league_id = g.league_id
        and ur.user_id = auth.uid()
        and ur.role in ('commissioner', 'manager', 'coach')
      where g.id = game_lineups.game_id
    )
    or exists (
      select 1 from scorekeeper_assignments sa
      where sa.game_id = game_lineups.game_id and sa.user_id = auth.uid()
    )
  );

-- ============================================
-- RLS POLICIES — game_events
-- ============================================
alter table game_events enable row level security;

create policy "Events viewable by league members"
  on game_events for select to authenticated
  using (
    exists (
      select 1 from games g
      join user_roles ur on ur.league_id = g.league_id and ur.user_id = auth.uid()
      where g.id = game_events.game_id
    )
  );

create policy "Scorekeepers can insert events"
  on game_events for insert to authenticated
  with check (
    exists (
      select 1 from scorekeeper_assignments sa
      where sa.game_id = game_events.game_id and sa.user_id = auth.uid()
    )
  );

create policy "Scorekeepers can update events"
  on game_events for update to authenticated
  using (
    exists (
      select 1 from scorekeeper_assignments sa
      where sa.game_id = game_events.game_id and sa.user_id = auth.uid()
    )
  );

-- No DELETE policy — use soft delete (is_deleted = true)

-- ============================================
-- RLS POLICIES — scorekeeper_messages
-- ============================================
alter table scorekeeper_messages enable row level security;

create policy "SK messages viewable by game scorekeepers"
  on scorekeeper_messages for select to authenticated
  using (
    exists (
      select 1 from scorekeeper_assignments sa
      where sa.game_id = scorekeeper_messages.game_id and sa.user_id = auth.uid()
    )
  );

create policy "Scorekeepers can insert messages"
  on scorekeeper_messages for insert to authenticated
  with check (
    exists (
      select 1 from scorekeeper_assignments sa
      where sa.game_id = scorekeeper_messages.game_id and sa.user_id = auth.uid()
    )
  );

-- ============================================
-- RPC: assign_scorekeeper
-- ============================================
create or replace function assign_scorekeeper(
  p_game_id uuid,
  p_team_id uuid,
  p_user_id uuid
)
returns uuid as $$
declare
  v_league_id uuid;
  v_assignment_id uuid;
begin
  -- Get game's league
  select league_id into v_league_id
  from games where id = p_game_id;

  if v_league_id is null then
    raise exception 'Game not found.';
  end if;

  -- Verify caller is manager or commissioner
  if not exists (
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = v_league_id
      and role in ('commissioner', 'manager')
  ) then
    raise exception 'Only managers and commissioners can assign scorekeepers.';
  end if;

  -- Verify team is part of this game
  if not exists (
    select 1 from games
    where id = p_game_id
      and (home_team_id = p_team_id or away_team_id = p_team_id)
  ) then
    raise exception 'Team is not part of this game.';
  end if;

  -- Verify target user is a league member
  if not exists (
    select 1 from user_roles
    where user_id = p_user_id and league_id = v_league_id
  ) then
    raise exception 'User is not a member of this league.';
  end if;

  -- Verify game is scheduled or in_progress
  if not exists (
    select 1 from games
    where id = p_game_id and status in ('scheduled', 'in_progress')
  ) then
    raise exception 'Scorekeepers can only be assigned to scheduled or in-progress games.';
  end if;

  -- Upsert assignment
  insert into scorekeeper_assignments (game_id, team_id, user_id, assigned_by)
  values (p_game_id, p_team_id, p_user_id, auth.uid())
  on conflict (game_id, team_id)
  do update set user_id = excluded.user_id, assigned_by = excluded.assigned_by
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: set_game_lineup
-- ============================================
create or replace function set_game_lineup(
  p_game_id uuid,
  p_team_id uuid,
  p_lineup jsonb
)
returns integer as $$
declare
  v_league_id uuid;
  v_entry jsonb;
  v_count integer := 0;
  v_player_id uuid;
  v_batting integer;
  v_position integer;
begin
  -- Get game's league
  select league_id into v_league_id
  from games where id = p_game_id;

  if v_league_id is null then
    raise exception 'Game not found.';
  end if;

  -- Verify caller is authorized (scorekeeper, coach, manager, commissioner)
  if not exists (
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = v_league_id
      and role in ('commissioner', 'manager', 'coach')
  ) and not exists (
    select 1 from scorekeeper_assignments
    where game_id = p_game_id and user_id = auth.uid()
  ) then
    raise exception 'Not authorized to set lineup for this game.';
  end if;

  -- Verify team is part of this game
  if not exists (
    select 1 from games
    where id = p_game_id
      and (home_team_id = p_team_id or away_team_id = p_team_id)
  ) then
    raise exception 'Team is not part of this game.';
  end if;

  -- Mark existing active lineup as exited (soft clear)
  update game_lineups
  set exited_inning = 0
  where game_id = p_game_id
    and team_id = p_team_id
    and exited_inning is null;

  -- Insert new lineup entries
  for v_entry in select * from jsonb_array_elements(p_lineup)
  loop
    v_player_id := (v_entry->>'player_user_id')::uuid;
    v_batting := (v_entry->>'batting_order')::integer;
    v_position := (v_entry->>'fielding_position')::integer;

    -- Validate player is on team roster
    if not exists (
      select 1 from roster_entries
      where team_id = p_team_id
        and player_user_id = v_player_id
        and status = 'active'
    ) then
      raise exception 'Player % is not on the active roster for this team.', v_player_id;
    end if;

    insert into game_lineups (game_id, team_id, player_user_id, batting_order, fielding_position)
    values (p_game_id, p_team_id, v_player_id, v_batting, v_position);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: record_play
-- ============================================
create or replace function record_play(
  p_game_id uuid,
  p_event jsonb
)
returns uuid as $$
declare
  v_league_id uuid;
  v_game_status game_status;
  v_seq integer;
  v_event_id uuid;
  v_inning integer;
  v_inning_half text;
  v_runs integer;
  v_outs integer;
  v_home_team_id uuid;
  v_away_team_id uuid;
begin
  -- Fetch game info
  select league_id, status, home_team_id, away_team_id
  into v_league_id, v_game_status, v_home_team_id, v_away_team_id
  from games where id = p_game_id;

  if v_league_id is null then
    raise exception 'Game not found.';
  end if;

  if v_game_status != 'in_progress' then
    raise exception 'Game must be in progress to record plays.';
  end if;

  -- Verify caller is an assigned scorekeeper
  if not exists (
    select 1 from scorekeeper_assignments
    where game_id = p_game_id and user_id = auth.uid()
  ) then
    raise exception 'Only assigned scorekeepers can record plays.';
  end if;

  -- Get next sequence number
  select coalesce(max(sequence_number), 0) + 1 into v_seq
  from game_events
  where game_id = p_game_id and not is_deleted;

  v_inning := (p_event->>'inning')::integer;
  v_inning_half := p_event->>'inning_half';
  v_runs := coalesce((p_event->>'runs_scored')::integer, 0);
  v_outs := coalesce((p_event->>'outs_after')::integer, 0);

  -- Insert the event
  insert into game_events (
    game_id, inning, inning_half, sequence_number,
    batter_user_id, pitcher_user_id,
    outcome, hit_location, fielding_sequence,
    outs_before, outs_after, runs_scored,
    runners_before, runners_after, runner_movements,
    pitch_count_at_event, balls, strikes,
    recorded_by, consensus,
    video_timestamp_seconds, notes
  ) values (
    p_game_id,
    v_inning,
    v_inning_half,
    v_seq,
    (p_event->>'batter_user_id')::uuid,
    (p_event->>'pitcher_user_id')::uuid,
    (p_event->>'outcome')::play_outcome,
    (p_event->>'hit_location')::integer,
    p_event->>'fielding_sequence',
    coalesce((p_event->>'outs_before')::integer, 0),
    v_outs,
    v_runs,
    coalesce(p_event->'runners_before', '{"first":null,"second":null,"third":null}'::jsonb),
    coalesce(p_event->'runners_after', '{"first":null,"second":null,"third":null}'::jsonb),
    p_event->'runner_movements',
    (p_event->>'pitch_count_at_event')::integer,
    (p_event->>'balls')::integer,
    (p_event->>'strikes')::integer,
    auth.uid(),
    'pending',
    (p_event->>'video_timestamp_seconds')::integer,
    p_event->>'notes'
  ) returning id into v_event_id;

  -- Recalculate and update game scores from all non-deleted events
  update games set
    home_score = (
      select coalesce(sum(ge.runs_scored), 0)
      from game_events ge
      where ge.game_id = p_game_id
        and ge.inning_half = 'bottom'
        and not ge.is_deleted
    ),
    away_score = (
      select coalesce(sum(ge.runs_scored), 0)
      from game_events ge
      where ge.game_id = p_game_id
        and ge.inning_half = 'top'
        and not ge.is_deleted
    ),
    inning = v_inning,
    inning_half = v_inning_half
  where id = p_game_id;

  return v_event_id;
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: get_game_state
-- ============================================
create or replace function get_game_state(p_game_id uuid)
returns json as $$
declare
  v_league_id uuid;
  v_result json;
begin
  -- Get league
  select league_id into v_league_id
  from games where id = p_game_id;

  if v_league_id is null then
    raise exception 'Game not found.';
  end if;

  -- Verify caller is league member
  if not exists (
    select 1 from user_roles
    where user_id = auth.uid() and league_id = v_league_id
  ) then
    raise exception 'Not a member of this league.';
  end if;

  select json_build_object(
    'game', (
      select row_to_json(g_row) from (
        select g.id, g.league_id, g.home_team_id, g.away_team_id,
               g.field_id, g.diamond_number, g.scheduled_at,
               g.status, g.home_score, g.away_score,
               g.inning, g.inning_half, g.notes,
               ht.name as home_team_name, ht.color as home_team_color,
               at_.name as away_team_name, at_.color as away_team_color,
               f.name as field_name, l.name as league_name
        from games g
        join teams ht on ht.id = g.home_team_id
        join teams at_ on at_.id = g.away_team_id
        left join fields f on f.id = g.field_id
        join leagues l on l.id = g.league_id
        where g.id = p_game_id
      ) g_row
    ),
    'home_lineup', (
      select coalesce(json_agg(row_to_json(hl) order by hl.batting_order), '[]'::json) from (
        select gl.id, gl.player_user_id, gl.batting_order, gl.fielding_position,
               gl.is_substitute, gl.entered_inning, gl.exited_inning,
               p.full_name as player_name,
               re.jersey_number
        from game_lineups gl
        join profiles p on p.id = gl.player_user_id
        left join roster_entries re on re.player_user_id = gl.player_user_id
          and re.team_id = gl.team_id
        join games g on g.id = gl.game_id
        where gl.game_id = p_game_id
          and gl.team_id = g.home_team_id
          and gl.exited_inning is null
      ) hl
    ),
    'away_lineup', (
      select coalesce(json_agg(row_to_json(al) order by al.batting_order), '[]'::json) from (
        select gl.id, gl.player_user_id, gl.batting_order, gl.fielding_position,
               gl.is_substitute, gl.entered_inning, gl.exited_inning,
               p.full_name as player_name,
               re.jersey_number
        from game_lineups gl
        join profiles p on p.id = gl.player_user_id
        left join roster_entries re on re.player_user_id = gl.player_user_id
          and re.team_id = gl.team_id
        join games g on g.id = gl.game_id
        where gl.game_id = p_game_id
          and gl.team_id = g.away_team_id
          and gl.exited_inning is null
      ) al
    ),
    'events', (
      select coalesce(json_agg(row_to_json(ev) order by ev.sequence_number), '[]'::json) from (
        select ge.id, ge.inning, ge.inning_half, ge.sequence_number,
               ge.batter_user_id, ge.pitcher_user_id,
               ge.outcome::text, ge.hit_location, ge.fielding_sequence,
               ge.outs_before, ge.outs_after, ge.runs_scored,
               ge.runners_before, ge.runners_after, ge.runner_movements,
               ge.pitch_count_at_event, ge.balls, ge.strikes,
               ge.recorded_by, ge.partner_outcome::text,
               ge.partner_recorded_by, ge.consensus::text,
               ge.video_timestamp_seconds, ge.notes, ge.is_deleted,
               bp.full_name as batter_name,
               pp.full_name as pitcher_name
        from game_events ge
        left join profiles bp on bp.id = ge.batter_user_id
        left join profiles pp on pp.id = ge.pitcher_user_id
        where ge.game_id = p_game_id and not ge.is_deleted
      ) ev
    ),
    'scorekeepers', (
      select coalesce(json_agg(row_to_json(sk)), '[]'::json) from (
        select sa.id, sa.game_id, sa.team_id, sa.user_id, sa.assigned_by,
               p.full_name as user_name, p.email as user_email,
               t.name as team_name
        from scorekeeper_assignments sa
        join profiles p on p.id = sa.user_id
        join teams t on t.id = sa.team_id
        where sa.game_id = p_game_id
      ) sk
    )
  ) into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: undo_last_play
-- ============================================
create or replace function undo_last_play(p_game_id uuid)
returns uuid as $$
declare
  v_event_id uuid;
  v_inning integer;
  v_inning_half text;
begin
  -- Verify caller is an assigned scorekeeper
  if not exists (
    select 1 from scorekeeper_assignments
    where game_id = p_game_id and user_id = auth.uid()
  ) then
    raise exception 'Only assigned scorekeepers can undo plays.';
  end if;

  -- Find the last non-deleted event
  select id into v_event_id
  from game_events
  where game_id = p_game_id and not is_deleted
  order by sequence_number desc
  limit 1;

  if v_event_id is null then
    raise exception 'No plays to undo.';
  end if;

  -- Soft delete it
  update game_events set is_deleted = true where id = v_event_id;

  -- Recalculate game scores
  update games set
    home_score = (
      select coalesce(sum(ge.runs_scored), 0)
      from game_events ge
      where ge.game_id = p_game_id
        and ge.inning_half = 'bottom'
        and not ge.is_deleted
    ),
    away_score = (
      select coalesce(sum(ge.runs_scored), 0)
      from game_events ge
      where ge.game_id = p_game_id
        and ge.inning_half = 'top'
        and not ge.is_deleted
    ),
    inning = (
      select ge.inning from game_events ge
      where ge.game_id = p_game_id and not ge.is_deleted
      order by ge.sequence_number desc limit 1
    ),
    inning_half = (
      select ge.inning_half from game_events ge
      where ge.game_id = p_game_id and not ge.is_deleted
      order by ge.sequence_number desc limit 1
    )
  where id = p_game_id;

  return v_event_id;
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: get_game_lineup
-- ============================================
create or replace function get_game_lineup(p_game_id uuid, p_team_id uuid)
returns json as $$
declare
  v_league_id uuid;
begin
  select league_id into v_league_id
  from games where id = p_game_id;

  if v_league_id is null then
    raise exception 'Game not found.';
  end if;

  -- Verify caller is league member
  if not exists (
    select 1 from user_roles
    where user_id = auth.uid() and league_id = v_league_id
  ) then
    raise exception 'Not a member of this league.';
  end if;

  return (
    select coalesce(json_agg(row_to_json(lineup) order by lineup.batting_order), '[]'::json)
    from (
      select gl.id, gl.player_user_id, gl.batting_order, gl.fielding_position,
             gl.is_substitute, gl.entered_inning, gl.exited_inning,
             p.full_name as player_name,
             re.jersey_number
      from game_lineups gl
      join profiles p on p.id = gl.player_user_id
      left join roster_entries re on re.player_user_id = gl.player_user_id
        and re.team_id = gl.team_id
      where gl.game_id = p_game_id
        and gl.team_id = p_team_id
        and gl.exited_inning is null
    ) lineup
  );
end;
$$ language plpgsql security definer;
