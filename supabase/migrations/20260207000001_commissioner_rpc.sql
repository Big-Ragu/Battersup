-- Phase 2: Commissioner RPC functions
-- Solves the chicken-and-egg RLS problem: creating a league requires
-- a commissioner role, but the role can't be created without a league.

-- Atomically creates a league and assigns the creator as commissioner
create or replace function create_league_with_commissioner(
  p_name text,
  p_description text default null,
  p_season_year integer default extract(year from now())::integer,
  p_status league_status default 'draft'
)
returns uuid as $$
declare
  new_league_id uuid;
begin
  -- Create the league
  insert into leagues (name, description, season_year, status, created_by)
  values (p_name, p_description, p_season_year, p_status, auth.uid())
  returning id into new_league_id;

  -- Auto-assign the creator as commissioner
  insert into user_roles (user_id, league_id, role)
  values (auth.uid(), new_league_id, 'commissioner');

  return new_league_id;
end;
$$ language plpgsql security definer;
