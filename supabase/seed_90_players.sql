-- Seed 90 fictional players with password "Password"
-- Run in Supabase SQL Editor

create extension if not exists pgcrypto;

do $$
declare
  new_uid uuid;
  i integer;
  first_names text[] := ARRAY[
    'James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles',
    'Christopher','Daniel','Matthew','Anthony','Mark','Donald','Steven','Paul','Andrew','Joshua',
    'Kenneth','Kevin','Brian','George','Timothy','Ronald','Edward','Jason','Jeffrey','Ryan',
    'Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon',
    'Benjamin','Samuel','Raymond','Gregory','Frank','Alexander','Patrick','Jack','Dennis','Jerry',
    'Tyler','Aaron','Jose','Nathan','Henry','Douglas','Peter','Adam','Zachary','Walter',
    'Noah','Ethan','Logan','Lucas','Mason','Oliver','Elijah','Liam','Aiden','Carter',
    'Owen','Dylan','Luke','Gabriel','Caleb','Isaac','Connor','Evan','Nolan','Hunter',
    'Colton','Max','Wyatt','Blake','Miles','Leo','Tristan','Chase','Cole','Brody'
  ];
  last_names text[] := ARRAY[
    'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
    'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
    'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
    'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
    'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts',
    'Phillips','Evans','Turner','Diaz','Parker','Cruz','Edwards','Collins','Reyes','Stewart',
    'Morris','Morales','Murphy','Cook','Rogers','Gutierrez','Ortiz','Morgan','Cooper','Peterson',
    'Bailey','Reed','Kelly','Howard','Ramos','Kim','Cox','Ward','Richardson','Watson',
    'Brooks','Chavez','Wood','James','Bennett','Gray','Mendoza','Ruiz','Hughes','Price'
  ];
  fname text;
  lname text;
  fake_email text;
  v_league_id uuid;
begin
  -- Get the first league (adjust if needed)
  select id into v_league_id from leagues order by created_at limit 1;

  for i in 1..90 loop
    fname := first_names[i];
    lname := last_names[i];
    fake_email := lower(fname) || '.' || lower(lname) || '@battersup-test.com';
    new_uid := uuid_generate_v4();

    -- Create auth user
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new
    ) values (
      new_uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      fake_email,
      crypt('Password', gen_salt('bf')),
      now(),
      jsonb_build_object('full_name', fname || ' ' || lname),
      now(),
      now(),
      '', '', ''
    );

    -- Assign as player in the league
    insert into user_roles (user_id, league_id, role)
    values (new_uid, v_league_id, 'player');
  end loop;
end $$;
