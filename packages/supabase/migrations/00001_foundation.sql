-- BattersUp Foundation Schema
-- Phase 1: Core tables for profiles, leagues, teams, fields, roles, and signup codes

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

create type league_status as enum ('draft', 'active', 'completed');
create type user_role_type as enum ('commissioner', 'manager', 'coach', 'player', 'parent', 'fan');

-- ============================================
-- PROFILES (extends auth.users)
-- ============================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================
-- LEAGUES
-- ============================================

create table leagues (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  season_year integer not null default extract(year from now()),
  status league_status not null default 'draft',
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================
-- TEAMS
-- ============================================

create table teams (
  id uuid primary key default uuid_generate_v4(),
  league_id uuid not null references leagues(id) on delete cascade,
  name text not null,
  color text,
  logo_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================
-- FIELDS
-- ============================================

create table fields (
  id uuid primary key default uuid_generate_v4(),
  league_id uuid not null references leagues(id) on delete cascade,
  name text not null,
  address text,
  diamond_count integer not null default 1,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================
-- USER ROLES (maps users to leagues/teams with a role)
-- ============================================

create table user_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid not null references leagues(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  role user_role_type not null,
  assigned_at timestamptz default now() not null,
  unique(user_id, league_id, role)
);

-- ============================================
-- SIGNUP CODES
-- ============================================

create table signup_codes (
  id uuid primary key default uuid_generate_v4(),
  league_id uuid not null references leagues(id) on delete cascade,
  code text not null unique,
  role user_role_type not null,
  team_id uuid references teams(id) on delete set null,
  max_uses integer,
  use_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz default now() not null
);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();

create trigger leagues_updated_at before update on leagues
  for each row execute function update_updated_at();

create trigger teams_updated_at before update on teams
  for each row execute function update_updated_at();

create trigger fields_updated_at before update on fields
  for each row execute function update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

alter table profiles enable row level security;
alter table leagues enable row level security;
alter table teams enable row level security;
alter table fields enable row level security;
alter table user_roles enable row level security;
alter table signup_codes enable row level security;

-- Profiles: users can read any profile, update their own
create policy "Profiles are viewable by authenticated users"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

-- Leagues: viewable by members, editable by commissioners
create policy "Leagues viewable by members"
  on leagues for select
  to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.league_id = leagues.id
        and user_roles.user_id = auth.uid()
    )
  );

create policy "Commissioners can insert leagues"
  on leagues for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Commissioners can update their leagues"
  on leagues for update
  to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.league_id = leagues.id
        and user_roles.user_id = auth.uid()
        and user_roles.role = 'commissioner'
    )
  );

-- Teams: viewable by league members, editable by commissioners
create policy "Teams viewable by league members"
  on teams for select
  to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.league_id = teams.league_id
        and user_roles.user_id = auth.uid()
    )
  );

create policy "Commissioners can manage teams"
  on teams for all
  to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.league_id = teams.league_id
        and user_roles.user_id = auth.uid()
        and user_roles.role = 'commissioner'
    )
  );

-- Fields: viewable by league members, editable by commissioners
create policy "Fields viewable by league members"
  on fields for select
  to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.league_id = fields.league_id
        and user_roles.user_id = auth.uid()
    )
  );

create policy "Commissioners can manage fields"
  on fields for all
  to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.league_id = fields.league_id
        and user_roles.user_id = auth.uid()
        and user_roles.role = 'commissioner'
    )
  );

-- User Roles: users can see roles in their leagues
create policy "User roles viewable by league members"
  on user_roles for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from user_roles ur
      where ur.league_id = user_roles.league_id
        and ur.user_id = auth.uid()
    )
  );

create policy "Commissioners can manage user roles"
  on user_roles for all
  to authenticated
  using (
    exists (
      select 1 from user_roles ur
      where ur.league_id = user_roles.league_id
        and ur.user_id = auth.uid()
        and ur.role = 'commissioner'
    )
  );

-- Signup Codes: viewable by commissioners, redeemable by anyone authenticated
create policy "Commissioners can manage signup codes"
  on signup_codes for all
  to authenticated
  using (
    exists (
      select 1 from user_roles
      where user_roles.league_id = signup_codes.league_id
        and user_roles.user_id = auth.uid()
        and user_roles.role = 'commissioner'
    )
  );

create policy "Authenticated users can read signup codes by code value"
  on signup_codes for select
  to authenticated
  using (true);

-- ============================================
-- INDEXES
-- ============================================

create index idx_user_roles_user_id on user_roles(user_id);
create index idx_user_roles_league_id on user_roles(league_id);
create index idx_teams_league_id on teams(league_id);
create index idx_fields_league_id on fields(league_id);
create index idx_signup_codes_code on signup_codes(code);
create index idx_signup_codes_league_id on signup_codes(league_id);
