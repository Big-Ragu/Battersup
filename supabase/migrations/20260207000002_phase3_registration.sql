-- Phase 3: Registration & Role Assignment
-- Adds signup code redemption RPC, commissioner role assignment RPC,
-- and player_parents table for parent-player linking.

-- Drop old function signatures from previous Phase 3 attempt (if any)
drop function if exists redeem_signup_code(text);
drop function if exists commissioner_assign_role(uuid, text, user_role_type, uuid);
drop function if exists get_league_members(uuid[]);

-- ============================================
-- PLAYER-PARENT LINKING TABLE
-- ============================================

create table if not exists player_parents (
  id uuid primary key default uuid_generate_v4(),
  player_user_id uuid not null references auth.users(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz default now() not null,
  unique(player_user_id, parent_user_id)
);

alter table player_parents enable row level security;

-- Parents can see their own links
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'player_parents' and policyname = 'Parents can view own links'
  ) then
    create policy "Parents can view own links"
      on player_parents for select
      to authenticated
      using (parent_user_id = auth.uid() or player_user_id = auth.uid());
  end if;
end $$;

-- Commissioners can manage player-parent links (via league membership check done in RPC)
-- For now, only SECURITY DEFINER RPCs will insert/delete.

-- ============================================
-- REDEEM SIGNUP CODE RPC
-- ============================================
-- Atomically validates a signup code, creates the user_role, and increments use_count.
-- Bypasses RLS so that any authenticated user can redeem a code.

create or replace function redeem_signup_code(p_code text)
returns json as $$
declare
  v_code_row record;
  v_league_name text;
  v_team_name text;
  v_existing_role uuid;
begin
  -- Look up the code
  select * into v_code_row
  from signup_codes
  where code = upper(trim(p_code));

  if v_code_row is null then
    raise exception 'Invalid signup code.';
  end if;

  -- Check expiry
  if v_code_row.expires_at is not null and v_code_row.expires_at < now() then
    raise exception 'This signup code has expired.';
  end if;

  -- Check max uses
  if v_code_row.max_uses is not null and v_code_row.use_count >= v_code_row.max_uses then
    raise exception 'This signup code has reached its maximum number of uses.';
  end if;

  -- Check for duplicate (same user, same league, same role)
  select id into v_existing_role
  from user_roles
  where user_id = auth.uid()
    and league_id = v_code_row.league_id
    and role = v_code_row.role;

  if v_existing_role is not null then
    raise exception 'You already have this role in this league.';
  end if;

  -- Create the user_role
  insert into user_roles (user_id, league_id, team_id, role)
  values (auth.uid(), v_code_row.league_id, v_code_row.team_id, v_code_row.role);

  -- Increment use count
  update signup_codes
  set use_count = use_count + 1
  where id = v_code_row.id;

  -- Look up league name for the response
  select name into v_league_name from leagues where id = v_code_row.league_id;

  -- Look up team name if applicable
  if v_code_row.team_id is not null then
    select name into v_team_name from teams where id = v_code_row.team_id;
  end if;

  return json_build_object(
    'league_id', v_code_row.league_id,
    'league_name', v_league_name,
    'team_id', v_code_row.team_id,
    'team_name', v_team_name,
    'role', v_code_row.role
  );
end;
$$ language plpgsql security definer;

-- ============================================
-- COMMISSIONER ASSIGN ROLE RPC
-- ============================================
-- Allows a commissioner to manually assign a role to a user by email.
-- Verifies the caller is a commissioner of the target league.

create or replace function commissioner_assign_role(
  p_league_id uuid,
  p_user_email text,
  p_role user_role_type,
  p_team_id uuid default null
)
returns json as $$
declare
  v_is_commissioner boolean;
  v_target_user_id uuid;
  v_existing_role uuid;
  v_league_name text;
begin
  -- Verify caller is commissioner of this league
  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = p_league_id
      and role = 'commissioner'
  ) into v_is_commissioner;

  if not v_is_commissioner then
    raise exception 'You are not a commissioner of this league.';
  end if;

  -- Find the target user by email
  select id into v_target_user_id
  from profiles
  where email = lower(trim(p_user_email));

  if v_target_user_id is null then
    raise exception 'No user found with that email address. They must register first.';
  end if;

  -- Check for duplicate role
  select id into v_existing_role
  from user_roles
  where user_id = v_target_user_id
    and league_id = p_league_id
    and role = p_role;

  if v_existing_role is not null then
    raise exception 'This user already has this role in this league.';
  end if;

  -- Insert the role
  insert into user_roles (user_id, league_id, team_id, role)
  values (v_target_user_id, p_league_id, p_team_id, p_role);

  select name into v_league_name from leagues where id = p_league_id;

  return json_build_object(
    'user_id', v_target_user_id,
    'league_name', v_league_name,
    'role', p_role
  );
end;
$$ language plpgsql security definer;

-- ============================================
-- GET LEAGUE MEMBERS RPC (for commissioner members page)
-- ============================================
-- Returns all members for the given league IDs, verifying the caller
-- is a commissioner of each league.

create or replace function get_league_members(p_league_ids uuid[])
returns table(
  role_id uuid,
  user_id uuid,
  league_id uuid,
  league_name text,
  team_id uuid,
  team_name text,
  role text,
  full_name text,
  email text,
  assigned_at timestamptz
) as $$
begin
  return query
  select
    ur.id as role_id,
    ur.user_id,
    ur.league_id,
    l.name as league_name,
    ur.team_id,
    t.name as team_name,
    ur.role::text,
    p.full_name,
    p.email,
    ur.assigned_at
  from user_roles ur
  join leagues l on l.id = ur.league_id
  join profiles p on p.id = ur.user_id
  left join teams t on t.id = ur.team_id
  where ur.league_id = any(p_league_ids)
    -- Only return data for leagues where caller is commissioner
    and exists(
      select 1 from user_roles cr
      where cr.league_id = ur.league_id
        and cr.user_id = auth.uid()
        and cr.role = 'commissioner'
    )
  order by l.name, ur.role, p.full_name;
end;
$$ language plpgsql security definer;

-- ============================================
-- COMMISSIONER UPDATE USER ROLE RPC
-- ============================================
-- Allows a commissioner to update team_id and/or role on a user_role entry.
-- Bypasses RLS (which silently blocks client-side updates on other users' rows
-- because the SELECT policy only shows the caller's own roles).

create or replace function commissioner_update_user_role(
  p_role_id uuid,
  p_team_id uuid default null,
  p_role user_role_type default null,
  p_clear_team boolean default false
)
returns json as $$
declare
  v_existing record;
  v_is_commissioner boolean;
begin
  -- Look up the role entry
  select * into v_existing from user_roles where id = p_role_id;

  if v_existing is null then
    raise exception 'Role entry not found.';
  end if;

  -- Verify caller is commissioner of this league
  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = v_existing.league_id
      and role = 'commissioner'
  ) into v_is_commissioner;

  if not v_is_commissioner then
    raise exception 'You are not a commissioner of this league.';
  end if;

  -- Apply updates
  update user_roles
  set
    team_id = case
      when p_clear_team then null
      when p_team_id is not null then p_team_id
      else team_id
    end,
    role = coalesce(p_role, user_roles.role)
  where id = p_role_id;

  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- ============================================
-- COMMISSIONER DELETE USER ROLE RPC
-- ============================================
-- Allows a commissioner to remove a user_role entry.
-- Same RLS bypass reason as the update RPC above.

create or replace function commissioner_delete_user_role(p_role_id uuid)
returns json as $$
declare
  v_existing record;
  v_is_commissioner boolean;
begin
  select * into v_existing from user_roles where id = p_role_id;

  if v_existing is null then
    raise exception 'Role entry not found.';
  end if;

  -- Prevent deleting commissioner roles
  if v_existing.role = 'commissioner' then
    raise exception 'Cannot remove a commissioner role.';
  end if;

  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = v_existing.league_id
      and role = 'commissioner'
  ) into v_is_commissioner;

  if not v_is_commissioner then
    raise exception 'You are not a commissioner of this league.';
  end if;

  delete from user_roles where id = p_role_id;

  return json_build_object('success', true);
end;
$$ language plpgsql security definer;

-- ============================================
-- COMMISSIONER TOGGLE MANAGER-PLAYER RPC
-- ============================================
-- For adult leagues where the manager also plays.
-- Toggles a 'player' role entry for a user who is already a manager/coach on the team.
-- If the player role exists, removes it. If not, creates it.

create or replace function commissioner_toggle_manager_player(
  p_user_id uuid,
  p_league_id uuid,
  p_team_id uuid
)
returns json as $$
declare
  v_is_commissioner boolean;
  v_existing_player_role uuid;
begin
  -- Verify caller is commissioner of this league
  select exists(
    select 1 from user_roles
    where user_id = auth.uid()
      and league_id = p_league_id
      and role = 'commissioner'
  ) into v_is_commissioner;

  if not v_is_commissioner then
    raise exception 'You are not a commissioner of this league.';
  end if;

  -- Check if user already has a player role on this team
  select id into v_existing_player_role
  from user_roles
  where user_id = p_user_id
    and league_id = p_league_id
    and team_id = p_team_id
    and role = 'player';

  if v_existing_player_role is not null then
    -- Remove the player role
    delete from user_roles where id = v_existing_player_role;
    return json_build_object('is_player', false);
  else
    -- Add a player role
    insert into user_roles (user_id, league_id, team_id, role)
    values (p_user_id, p_league_id, p_team_id, 'player');
    return json_build_object('is_player', true);
  end if;
end;
$$ language plpgsql security definer;
