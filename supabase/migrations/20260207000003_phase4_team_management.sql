-- Phase 4: Team Management
-- Adds roster_entries table, RLS policies, RPC functions for roster management,
-- and cascade triggers to keep roster_entries in sync with user_roles.

-- ============================================
-- ROSTER STATUS ENUM
-- ============================================
create type roster_status as enum ('active', 'inactive', 'injured');

-- ============================================
-- ROSTER ENTRIES TABLE
-- ============================================
create table roster_entries (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references teams(id) on delete cascade,
  player_user_id uuid not null references auth.users(id) on delete cascade,
  "position" text,
  jersey_number integer,
  status roster_status not null default 'active',
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(team_id, player_user_id)
);

create trigger roster_entries_updated_at before update on roster_entries
  for each row execute function update_updated_at();

-- Indexes
create index idx_roster_entries_team_id on roster_entries(team_id);
create index idx_roster_entries_player_user_id on roster_entries(player_user_id);
create index idx_roster_entries_team_jersey on roster_entries(team_id, jersey_number)
  where jersey_number is not null;

-- ============================================
-- RLS POLICIES (split — never use FOR ALL)
-- ============================================
alter table roster_entries enable row level security;

-- SELECT: Any authenticated user in the same league can view roster entries
create policy "Roster entries viewable by league members"
  on roster_entries for select
  to authenticated
  using (
    exists (
      select 1 from teams t
      join user_roles ur on ur.league_id = t.league_id
      where t.id = roster_entries.team_id
        and ur.user_id = auth.uid()
    )
  );

-- INSERT: Coach of that team, manager, or commissioner in the league
create policy "Coaches/managers/commissioners can insert roster entries"
  on roster_entries for insert
  to authenticated
  with check (
    exists (
      select 1 from teams t
      join user_roles ur on ur.league_id = t.league_id
      where t.id = roster_entries.team_id
        and ur.user_id = auth.uid()
        and (
          (ur.role = 'coach' and ur.team_id = roster_entries.team_id)
          or ur.role = 'manager'
          or ur.role = 'commissioner'
        )
    )
  );

-- UPDATE: Coach of that team, manager, or commissioner
create policy "Coaches/managers/commissioners can update roster entries"
  on roster_entries for update
  to authenticated
  using (
    exists (
      select 1 from teams t
      join user_roles ur on ur.league_id = t.league_id
      where t.id = roster_entries.team_id
        and ur.user_id = auth.uid()
        and (
          (ur.role = 'coach' and ur.team_id = roster_entries.team_id)
          or ur.role = 'manager'
          or ur.role = 'commissioner'
        )
    )
  );

-- DELETE: Manager or commissioner only
create policy "Managers/commissioners can delete roster entries"
  on roster_entries for delete
  to authenticated
  using (
    exists (
      select 1 from teams t
      join user_roles ur on ur.league_id = t.league_id
      where t.id = roster_entries.team_id
        and ur.user_id = auth.uid()
        and (ur.role = 'manager' or ur.role = 'commissioner')
    )
  );

-- ============================================
-- RPC: get_team_roster
-- ============================================
-- Returns roster entries with joined profile data.
-- Verifies the caller is in the same league.

create or replace function get_team_roster(p_team_id uuid)
returns table(
  roster_entry_id uuid,
  team_id uuid,
  team_name text,
  league_id uuid,
  player_user_id uuid,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  "position" text,
  jersey_number integer,
  status text,
  notes text,
  created_at timestamptz
) as $$
begin
  -- Verify caller is in the same league
  if not exists (
    select 1 from teams t
    join user_roles ur on ur.league_id = t.league_id
    where t.id = p_team_id
      and ur.user_id = auth.uid()
  ) then
    raise exception 'You do not have access to this team.';
  end if;

  return query
  select
    re.id as roster_entry_id,
    re.team_id,
    t.name as team_name,
    t.league_id,
    re.player_user_id,
    p.full_name,
    p.email,
    p.phone,
    p.avatar_url,
    re."position",
    re.jersey_number,
    re.status::text,
    re.notes,
    re.created_at
  from roster_entries re
  join teams t on t.id = re.team_id
  join profiles p on p.id = re.player_user_id
  where re.team_id = p_team_id
  order by re.jersey_number nulls last, p.full_name;
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: add_player_to_roster
-- ============================================
-- Adds a player (who already has a user_role on this team) to the game roster.

create or replace function add_player_to_roster(
  p_team_id uuid,
  p_player_user_id uuid,
  p_position text default null,
  p_jersey_number integer default null
)
returns json as $$
declare
  v_team record;
  v_is_authorized boolean;
  v_player_on_team boolean;
  v_already_on_roster uuid;
  v_new_id uuid;
begin
  -- Fetch team info
  select * into v_team from teams where id = p_team_id;
  if v_team is null then
    raise exception 'Team not found.';
  end if;

  -- Verify caller is coach of this team, or manager/commissioner of the league
  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = v_team.league_id
      and (
        (role = 'coach' and team_id = p_team_id)
        or role = 'manager'
        or role = 'commissioner'
      )
  ) into v_is_authorized;

  if not v_is_authorized then
    raise exception 'You are not authorized to manage this roster.';
  end if;

  -- Verify the player has a user_role on this team with role='player'
  select exists(
    select 1 from user_roles
    where user_id = p_player_user_id
      and league_id = v_team.league_id
      and team_id = p_team_id
      and role = 'player'
  ) into v_player_on_team;

  if not v_player_on_team then
    raise exception 'This player is not assigned to this team. Assign them first via the Members page.';
  end if;

  -- Check if already on roster
  select id into v_already_on_roster
  from roster_entries
  where team_id = p_team_id
    and player_user_id = p_player_user_id;

  if v_already_on_roster is not null then
    raise exception 'This player is already on the roster.';
  end if;

  -- Check jersey number uniqueness within team (if provided)
  if p_jersey_number is not null then
    if exists (
      select 1 from roster_entries
      where team_id = p_team_id
        and jersey_number = p_jersey_number
    ) then
      raise exception 'Jersey number % is already taken on this team.', p_jersey_number;
    end if;
  end if;

  -- Insert roster entry
  insert into roster_entries (team_id, player_user_id, "position", jersey_number)
  values (p_team_id, p_player_user_id, p_position, p_jersey_number)
  returning id into v_new_id;

  return json_build_object('id', v_new_id);
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: update_roster_entry
-- ============================================
-- Coach updates position, jersey number, status, notes on a roster entry.

create or replace function update_roster_entry(
  p_entry_id uuid,
  p_position text default null,
  p_jersey_number integer default null,
  p_status text default null,
  p_notes text default null,
  p_clear_jersey boolean default false,
  p_clear_position boolean default false,
  p_clear_notes boolean default false
)
returns json as $$
declare
  v_entry record;
  v_team record;
  v_is_authorized boolean;
  v_status roster_status;
begin
  select * into v_entry from roster_entries where id = p_entry_id;
  if v_entry is null then
    raise exception 'Roster entry not found.';
  end if;

  select * into v_team from teams where id = v_entry.team_id;

  -- Verify caller is coach of this team, or manager/commissioner
  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = v_team.league_id
      and (
        (role = 'coach' and team_id = v_entry.team_id)
        or role = 'manager'
        or role = 'commissioner'
      )
  ) into v_is_authorized;

  if not v_is_authorized then
    raise exception 'You are not authorized to update this roster entry.';
  end if;

  -- Check jersey number uniqueness if changing it
  if p_jersey_number is not null and p_jersey_number != coalesce(v_entry.jersey_number, -1) then
    if exists (
      select 1 from roster_entries
      where team_id = v_entry.team_id
        and jersey_number = p_jersey_number
        and id != p_entry_id
    ) then
      raise exception 'Jersey number % is already taken on this team.', p_jersey_number;
    end if;
  end if;

  -- Cast status if provided
  if p_status is not null then
    v_status := p_status::roster_status;
  end if;

  update roster_entries
  set
    "position" = case
      when p_clear_position then null
      when p_position is not null then p_position
      else "position"
    end,
    jersey_number = case
      when p_clear_jersey then null
      when p_jersey_number is not null then p_jersey_number
      else jersey_number
    end,
    status = coalesce(v_status, roster_entries.status),
    notes = case
      when p_clear_notes then null
      when p_notes is not null then p_notes
      else notes
    end
  where id = p_entry_id;

  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: manager_move_player
-- ============================================
-- Moves a player from one team to another within the same league.
-- Clears jersey_number and position (new team's coach reassigns).
-- Also updates the player's user_roles.team_id.

create or replace function manager_move_player(
  p_entry_id uuid,
  p_new_team_id uuid
)
returns json as $$
declare
  v_entry record;
  v_old_team record;
  v_new_team record;
  v_is_authorized boolean;
begin
  select * into v_entry from roster_entries where id = p_entry_id;
  if v_entry is null then
    raise exception 'Roster entry not found.';
  end if;

  select * into v_old_team from teams where id = v_entry.team_id;
  select * into v_new_team from teams where id = p_new_team_id;

  if v_new_team is null then
    raise exception 'Target team not found.';
  end if;

  -- Both teams must be in the same league
  if v_old_team.league_id != v_new_team.league_id then
    raise exception 'Cannot move player to a team in a different league.';
  end if;

  -- Only managers and commissioners can move players
  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = v_old_team.league_id
      and role in ('manager', 'commissioner')
  ) into v_is_authorized;

  if not v_is_authorized then
    raise exception 'Only managers and commissioners can move players between teams.';
  end if;

  -- Check player isn't already on the new team's roster
  if exists (
    select 1 from roster_entries
    where team_id = p_new_team_id
      and player_user_id = v_entry.player_user_id
  ) then
    raise exception 'This player is already on the target team roster.';
  end if;

  -- Move the roster entry (clear jersey_number and position)
  update roster_entries
  set team_id = p_new_team_id,
      jersey_number = null,
      "position" = null
  where id = p_entry_id;

  -- Also update the player's user_role team_id
  update user_roles
  set team_id = p_new_team_id
  where user_id = v_entry.player_user_id
    and league_id = v_old_team.league_id
    and role = 'player'
    and team_id = v_old_team.id;

  return json_build_object(
    'success', true,
    'new_team_name', v_new_team.name
  );
end;
$$ language plpgsql security definer;

-- ============================================
-- RPC: remove_from_roster
-- ============================================
-- Removes a player from the roster without removing their user_role.

create or replace function remove_from_roster(p_entry_id uuid)
returns json as $$
declare
  v_entry record;
  v_team record;
  v_is_authorized boolean;
begin
  select * into v_entry from roster_entries where id = p_entry_id;
  if v_entry is null then
    raise exception 'Roster entry not found.';
  end if;

  select * into v_team from teams where id = v_entry.team_id;

  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = v_team.league_id
      and (role = 'manager' or role = 'commissioner')
  ) into v_is_authorized;

  if not v_is_authorized then
    raise exception 'Only managers and commissioners can remove players from the roster.';
  end if;

  delete from roster_entries where id = p_entry_id;

  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- ============================================
-- CASCADE TRIGGERS
-- ============================================
-- Auto-remove roster entry when a player's user_role team changes or role changes.

create or replace function handle_user_role_team_change()
returns trigger as $$
begin
  if (old.team_id is distinct from new.team_id) or (old.role = 'player' and new.role != 'player') then
    delete from roster_entries
    where player_user_id = old.user_id
      and team_id = old.team_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger user_role_team_change
  after update on user_roles
  for each row execute function handle_user_role_team_change();

-- Auto-remove roster entry when a player's user_role is deleted.

create or replace function handle_user_role_delete()
returns trigger as $$
begin
  if old.role = 'player' and old.team_id is not null then
    delete from roster_entries
    where player_user_id = old.user_id
      and team_id = old.team_id;
  end if;
  return old;
end;
$$ language plpgsql;

create trigger user_role_deleted
  after delete on user_roles
  for each row execute function handle_user_role_delete();

-- ============================================
-- AUTO-ADD TRIGGER
-- ============================================
-- Automatically create a roster entry when a player is assigned to a team.
-- Uses ON CONFLICT DO NOTHING to handle cases where the roster entry
-- already exists (e.g. manager_move_player updates user_roles after
-- moving the roster entry directly).

create or replace function auto_add_player_to_roster()
returns trigger as $$
begin
  if new.role = 'player' and new.team_id is not null then
    insert into roster_entries (team_id, player_user_id)
    values (new.team_id, new.user_id)
    on conflict (team_id, player_user_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql;

-- Fire on INSERT (new player assigned to team)
create trigger user_role_auto_roster_insert
  after insert on user_roles
  for each row execute function auto_add_player_to_roster();

-- Fire on UPDATE (player moved to a different team via commissioner)
create trigger user_role_auto_roster_update
  after update on user_roles
  for each row
  when (new.role = 'player' and new.team_id is not null)
  execute function auto_add_player_to_roster();

-- ============================================
-- BACKFILL: Add roster entries for existing players already on teams
-- ============================================
insert into roster_entries (team_id, player_user_id)
select ur.team_id, ur.user_id
from user_roles ur
where ur.role = 'player'
  and ur.team_id is not null
on conflict (team_id, player_user_id) do nothing;
