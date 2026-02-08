# BattersUp — Development Roadmap

> Baseball League Management App
> Last updated: 2026-02-08

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm |
| Web | Next.js 16 (App Router) + Tailwind CSS 4 |
| Mobile | Expo 54 (React Native) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime |
| Drag & Drop | @dnd-kit (depth chart) |
| Payments | Stripe (Phase 14) |
| Email | Resend or SendGrid (Phase 12) |
| Documents | DocuSign API (Phase 12) |

## Roles
Commissioner · Manager · Coach · Player · Parent · Fan

---

## Phase 1: Foundation ✅
> Monorepo, auth, database schema, universal dashboard shell

- [x] Initialize Turborepo monorepo with pnpm workspaces
- [x] Scaffold Next.js web app (`apps/web`)
- [x] Scaffold Expo mobile app (`apps/mobile`)
- [x] Create `@batters-up/shared` package (roles, types, constants)
- [x] Create `@batters-up/supabase` package (client, DB types)
- [x] Write foundation migration SQL (profiles, leagues, teams, fields, user_roles, signup_codes)
- [x] RLS policies for all tables
- [x] Auto-create profile trigger on user signup
- [x] Web: Login page
- [x] Web: Register page (with signup code field)
- [x] Web: Auth callback route
- [x] Web: Middleware for auth redirects
- [x] Web: Universal dashboard layout with role-based sidebar
- [x] Web: Role switcher (for users with multiple roles)
- [x] Web: Dashboard home page
- [x] Web: Profile page (view/edit)
- [x] Mobile: Supabase client with AsyncStorage
- [x] Mobile: Auth context provider
- [x] Mobile: Login screen
- [x] Mobile: Register screen
- [x] Mobile: Auth gate (auto-redirect based on auth state)
- [x] Mobile: Tab navigation (Dashboard, Schedule, Team, Profile)
- [x] Mobile: Dashboard screen
- [x] Mobile: Profile screen (view/edit)
- [x] Connect to live Supabase project
- [x] Run migration SQL in Supabase SQL Editor
- [x] Test full auth flow end-to-end (register → login → dashboard → logout)
- [ ] Generate typed DB client via `supabase gen types typescript` *(deferred — CLI connection issue, hand-written types work for now)*

**Migration:** `20260207000000_foundation.sql`

---

## Phase 2: Commissioner Dashboard ✅ (web)
> League, team, field, and signup code management

- [x] Commissioner overview/home page
- [x] League creation form + `create_league_with_commissioner` RPC (SECURITY DEFINER)
- [x] League edit/update form
- [x] League list view
- [x] Team creation form (name, color picker, logo upload)
- [x] Team edit/update form
- [x] Team list view
- [x] Field creation form (name, address, diamond count)
- [x] Field edit/update form
- [x] Field list view
- [x] Signup code generator (role, team, max uses, expiration, `BU-XXXXXX` format)
- [x] Signup code list with copy-to-clipboard
- [x] Signup code deactivation (sets `expires_at` to now)
- [x] Role-based route protection (commissioner layout guard)
- [ ] Mobile: Commissioner dashboard screens *(deferred)*

**Migration:** `20260207000001_commissioner_rpc.sql`

---

## Phase 3: Registration & Role Assignment ✅ (web)
> Signup code redemption, role assignment, parent-player linking

- [x] "Join League" page for existing users
- [x] Code validation logic (expiration, max uses)
- [x] Code redemption → auto-assign role + league + team (`redeem_signup_code` RPC)
- [x] `player_parents` database table
- [x] Commissioner: member list per league (`get_league_members` RPC)
- [x] Commissioner: manual role assignment (`commissioner_assign_role` RPC)
- [x] Commissioner: remove member from league
- [ ] Parent-player linking UI *(deferred — table created, needs UX design)*
- [ ] Mobile: Join league screen *(deferred)*

**Migration:** `20260207000002_phase3_registration.sql`

---

## Phase 4: Team Management ✅ (web)
> Rosters, positions, jersey numbers

- [x] `roster_entries` database table + RLS policies
- [x] Team roster page (all players with inline edit)
- [x] Player detail page (position, jersey number, contact info)
- [x] Coach: assign positions and jersey numbers
- [x] Coach: set player status (active/inactive/injured)
- [x] Manager: move players between teams (`manager_move_player` RPC)
- [x] Team directory (all teams in league)
- [x] Baseball positions constant (`packages/shared`)
- [x] Cascade triggers for roster cleanup
- [x] 5 RPCs: `get_team_roster`, `add_player_to_roster`, `update_roster_entry`, `manager_move_player`, `remove_from_roster`
- [ ] Mobile: Team roster screen *(deferred)*
- [ ] Mobile: Player detail screen *(deferred)*

**Migration:** `20260207000003_phase4_team_management.sql`

---

## Phase 5: Scheduling ✅ (web)
> League schedule creation, calendar views

- [x] `games` database table + RLS policies
- [x] Schedule builder — auto round-robin generator (`generate_round_robin` RPC)
- [x] Manual game creation form (home/away, date, time, field)
- [x] Calendar view (month/week)
- [x] Schedule list view (upcoming + past)
- [x] Filter by team
- [x] Field availability/conflict detection
- [x] Game hub detail page
- [x] Game status management (scheduled → in_progress → final → cancelled/postponed)
- [x] 5 RPCs: `create_game`, `update_game`, `update_game_status`, `get_league_schedule`, `generate_round_robin`
- [ ] Mobile: Schedule/calendar screen *(deferred)*
- [ ] Mobile: Game detail screen *(deferred)*

**Migration:** `20260207000004_phase5_scheduling.sql`

---

## Phase 6: Live Game Scoring 🔶
> Play-by-play scoring, lineup management, real-time scoreboard

### Phase 6A: Scoring Foundation ✅
- [x] `scorekeeper_assignments` table + RLS
- [x] `game_lineups` table + RLS
- [x] `game_events` table + RLS (play-by-play with soft-delete)
- [x] `scorekeeper_messages` table + RLS
- [x] `play_outcome` enum (single, double, triple, home_run, walk, strikeout, flyout, groundout, etc.)
- [x] Scorekeeper assignment page + `assign_scorekeeper` RPC
- [x] Game lineup editor + `set_game_lineup` RPC (validates active roster)
- [x] `record_play` RPC (SECURITY DEFINER) — inserts event, recalculates scores
- [x] `undo_last_play` RPC (SECURITY DEFINER) — soft-deletes last event, recalculates scores
- [x] `get_game_state` RPC — returns game + lineups + events + scorekeepers
- [x] `get_game_lineup` RPC
- [x] Play log component (chronological event display)

**Migration:** `20260207000005_phase6a_scoring.sql`

### Phase 6A+: Depth Chart & Standard Lineup ✅
- [x] `team_depth_chart` table + RLS (multi-position support)
- [x] `team_standard_lineups` table + RLS (full-roster batting order, nullable fielding)
- [x] Drag-and-drop depth chart editor with SVG baseball field (@dnd-kit)
- [x] Standard lineup editor with batting order + bench players
- [x] Game lineup pre-population from standard lineup
- [x] `save_depth_chart`, `save_standard_lineup`, `get_team_standard_lineup` RPCs
- [x] Cascade trigger for roster removal cleanup

**Migrations:** `20260207000006`, `20260207000007`, `20260207000008`, `20260207000009`

### Phase 6B: Interactive Scoring Interface ✅
- [x] Clickable SVG baseball field — tap a zone (1-9) to see context-appropriate outcomes
- [x] Zone-based outcome popup — appears at the clicked field position
- [x] Auto-record on popup click — no extra confirm step
- [x] Ball / Strike / Foul counter buttons with colored indicator dots
- [x] Auto-walk on 4 balls (forced runner advancement with chain logic)
- [x] Auto-strikeout on 3 strikes; foul caps at 2 strikes
- [x] Smart outcome defaults (`computeOutcomeDefaults`) — auto-calculates outs/runs/runners
- [x] Fallback "All outcomes" dropdown for non-field plays (walks, HBP, baserunning)
- [x] Simultaneous scoring — managers + commissioners can score alongside scorekeepers
- [x] Auto-refresh polling (5s) for live multi-scorer sync
- [x] Undo last play button
- [x] Shared constants: `FIELD_ZONE_OPTIONS`, `PLAY_OUTCOME_LABELS`, `PLAY_OUTCOME_COLORS`

**Migration:** `20260207000010_scoring_permissions.sql`

> **Next up:** Continue testing the game scorer end-to-end — verify play recording, undo, simultaneous multi-manager scoring, ball/strike auto-walk/strikeout, and runner advancement logic with live data.

### Phase 6C: Box Score & Game Summary ⬜
- [ ] Box score view (innings, hits, runs, errors)
- [ ] Inning-by-inning score breakdown
- [ ] Game summary page (final stats, key plays)
- [ ] End game flow (finalize score, set status to `final`)

### Phase 6D: Real-time & Mobile ⬜
- [ ] Supabase Realtime subscriptions (replace polling with live push)
- [ ] Live scoreboard component (public-facing, no auth required)
- [ ] Mobile: Scoring interface (phone-optimized)
- [ ] Mobile: Live scoreboard

---

## Phase 7: Stats & Leaderboards ⬜
> Personal stats, team stats, league leaderboards

- [ ] Batting stats calculation (AVG, HR, RBI, OBP, SLG, OPS)
- [ ] Team stats aggregation (W/L, PCT, GB, RS, RA)
- [ ] Player stats page
- [ ] Team stats page
- [ ] League leaderboard page (sortable columns)
- [ ] Season-over-season tracking
- [ ] Stats dashboard widgets
- [ ] Stat calculation utilities (`packages/shared`)
- [ ] Mobile: Player stats screen
- [ ] Mobile: Leaderboard screen

---

## Phase 8: Communication ⬜
> In-app messaging, announcements, push notifications

- [ ] `channels`, `channel_members`, `messages` database tables + migration
- [ ] `push_tokens`, `notification_preferences` tables + migration
- [ ] Team message board
- [ ] League-wide announcements (commissioner only)
- [ ] Direct messaging (coach ↔ parent)
- [ ] Real-time message updates (Supabase Realtime)
- [ ] Push notifications (Expo Push for mobile)
- [ ] Web push notifications
- [ ] Notification preferences (mute, quiet hours)
- [ ] Unread message badges
- [ ] Mobile: Message center
- [ ] Mobile: Chat screen
- [ ] Mobile: Push notification handling

---

## Phase 9: Digital Awards ⬜
> Post-game badges and trophy cases

- [ ] `award_types`, `player_awards` database tables + migration
- [ ] Default award library (MVP, Golden Glove, Clutch Hitter, etc.)
- [ ] Post-game award assignment interface (coaches)
- [ ] Player trophy case page
- [ ] Award display on player profiles
- [ ] Custom badge creation (commissioners)
- [ ] Award notification to players
- [ ] Mobile: Award assignment screen
- [ ] Mobile: Trophy case screen

---

## Phase 10: Playoffs ⬜
> Bracket generation, auto-advancement, standings

- [ ] `playoffs`, `playoff_seeds`, `playoff_matchups` database tables + migration
- [ ] Standings page with tiebreaker rules
- [ ] Bracket generator (single elimination, double elimination, best-of)
- [ ] Visual bracket display
- [ ] Auto-create games for bracket matchups
- [ ] Auto-advance winners when games finalize
- [ ] Playoff schedule integration with main calendar
- [ ] Championship winner display
- [ ] Mobile: Standings screen
- [ ] Mobile: Bracket view

---

## Phase 11: Commissioner Admin Tools ⬜
> Overturn results, vendor payments, audit log

- [ ] `audit_log` database table + migration
- [ ] `vendors`, `vendor_payments` database tables + migration
- [ ] Game result override (with reason)
- [ ] Play-by-play edit (modify at-bat results)
- [ ] Audit log viewer
- [ ] Stats recalculation after overrides
- [ ] Vendor management (add/edit vendors)
- [ ] Vendor payment tracker (invoices, status, due dates)
- [ ] League financial summary dashboard
- [ ] Mobile: Admin tools

---

## Phase 12: Email & DocuSign ⬜
> Mass email, document signing and tracking

- [ ] `email_campaigns` database table + migration
- [ ] `documents` database table + migration
- [ ] Email composer with recipient filters (by role, team)
- [ ] Email templates (welcome, schedule update, custom)
- [ ] Email service integration (Resend or SendGrid)
- [ ] DocuSign API integration
- [ ] Send documents for signing
- [ ] Document tracking dashboard (sent, signed, pending)
- [ ] Automated reminders for unsigned documents
- [ ] Mobile: Document status view

---

## Phase 13: Video & Media ⬜
> Game recording, clip tagging, highlight creation

- [ ] `media`, `media_tags` database tables + migration
- [ ] Supabase Storage bucket setup
- [ ] Mobile: In-app video recording
- [ ] Video upload (mobile → Supabase Storage)
- [ ] Auto-tag clips to at-bats/plays from scoring data
- [ ] Video clip trimmer
- [ ] Photo upload for game moments
- [ ] Media gallery per game
- [ ] Thumbnail generation
- [ ] Mobile: Camera/recording screen
- [ ] Mobile: Media gallery

---

## Phase 14: Premium Content Store ⬜
> Sell game moment videos and photos

- [ ] `store_products`, `orders`, `order_items`, `user_purchases` database tables + migration
- [ ] Content storefront (browse premium clips/photos)
- [ ] Stripe integration
- [ ] Purchase flow (preview → pay → download/stream)
- [ ] Commissioner: set pricing, mark content as premium
- [ ] Revenue dashboard for commissioners
- [ ] Watermark/preview for unpurchased content
- [ ] Digital delivery (watermark-free after purchase)
- [ ] Stripe webhook for payment confirmation
- [ ] Mobile: Store browsing
- [ ] Mobile: Purchase flow

---

## Database Migrations

| # | File | Status | Description |
|---|------|--------|-------------|
| 0 | `20260207000000_foundation.sql` | ✅ | Profiles, leagues, teams, fields, user_roles, signup_codes, RLS, triggers |
| 1 | `20260207000001_commissioner_rpc.sql` | ✅ | `create_league_with_commissioner` SECURITY DEFINER |
| 2 | `20260207000002_phase3_registration.sql` | ✅ | player_parents, redeem_signup_code, commissioner_assign_role, get_league_members |
| 3 | `20260207000003_phase4_team_management.sql` | ✅ | roster_entries, 5 roster RPCs, cascade triggers |
| 4 | `20260207000004_phase5_scheduling.sql` | ✅ | games table, 5 scheduling RPCs, field conflict detection |
| 5 | `20260207000005_phase6a_scoring.sql` | ✅ | scorekeeper_assignments, game_lineups, game_events, scorekeeper_messages, 6 RPCs |
| 6 | `20260207000006_depth_chart_and_standard_lineup.sql` | ✅ | team_depth_chart, team_standard_lineups, 3 RPCs, cascade trigger |
| 7 | `20260207000007_depth_chart_multi_position.sql` | ✅ | Drop unique constraint for multi-position depth chart |
| 8 | `20260207000008_full_roster_batting_order.sql` | ✅ | Full-roster batting orders, nullable fielding_position |
| 9 | `20260207000009_game_lineups_full_roster.sql` | ✅ | Game lineups support bench/bat-only players |
| 10 | `20260207000010_scoring_permissions.sql` | ✅ | Expand record_play/undo_last_play to managers + commissioners |

---

## Web App Route Map

| Route | Page | Role |
|-------|------|------|
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/callback` | Auth callback | Public |
| `/dashboard` | Dashboard home | All authenticated |
| `/profile` | Profile view/edit | All authenticated |
| `/join` | Join league via signup code | All authenticated |
| `/schedule` | League schedule (list + calendar) | All authenticated |
| `/schedule/[id]` | Schedule detail | All authenticated |
| `/games/[id]` | Game hub (detail, status, links) | All authenticated |
| `/games/[id]/lineup` | Set game lineup | Manager, Coach, Scorekeeper |
| `/games/[id]/scorekeepers` | Assign scorekeepers | Commissioner, Manager |
| `/games/[id]/score` | Scoring interface | Scorekeeper, Manager, Commissioner |
| `/games/[id]/live` | Live scoreboard | All authenticated |
| `/commissioner` | Commissioner overview | Commissioner |
| `/commissioner/leagues` | League list | Commissioner |
| `/commissioner/leagues/new` | Create league | Commissioner |
| `/commissioner/leagues/[id]/edit` | Edit league | Commissioner |
| `/commissioner/teams` | Team list | Commissioner |
| `/commissioner/teams/new` | Create team | Commissioner |
| `/commissioner/teams/[id]` | Team detail | Commissioner |
| `/commissioner/teams/[id]/edit` | Edit team | Commissioner |
| `/commissioner/fields` | Field list | Commissioner |
| `/commissioner/fields/new` | Create field | Commissioner |
| `/commissioner/fields/[id]/edit` | Edit field | Commissioner |
| `/commissioner/codes` | Signup code list | Commissioner |
| `/commissioner/codes/new` | Create signup code | Commissioner |
| `/commissioner/members` | League members | Commissioner |
| `/commissioner/members/assign` | Assign roles | Commissioner |
| `/commissioner/schedule` | Schedule management | Commissioner |
| `/commissioner/schedule/new` | Create game | Commissioner |
| `/commissioner/schedule/generate` | Round-robin generator | Commissioner |
| `/team/roster` | Team roster (inline edit) | Manager, Coach |
| `/team/roster/[id]` | Player detail | Manager, Coach |
| `/team/depth-chart` | Depth chart (DnD SVG field) | Manager, Coach |
| `/team/lineup` | Standard lineup editor | Manager, Coach |
| `/team/directory` | Team directory | All team members |
| `/team/directory/[id]` | Player profile | All team members |

---

## Shared Package (`@batters-up/shared`)

| Module | Exports |
|--------|---------|
| `constants/roles.ts` | `ROLES`, `ROLE_LABELS`, `ROLE_NAV_ITEMS` |
| `constants/positions.ts` | `POSITIONS`, `POSITION_TO_SCORING`, `SCORING_TO_POSITION`, `FIELD_DIAMOND_POSITIONS`, `FIELD_POSITION_COORDS` |
| `constants/roster.ts` | `ROSTER_STATUS_LABELS`, `ROSTER_STATUS_COLORS` |
| `constants/schedule.ts` | `GAME_STATUS_LABELS`, `GAME_STATUS_COLORS` |
| `constants/scoring.ts` | `FIELD_POSITIONS`, `FIELD_POSITION_ABBREV`, `FIELD_ZONE_OPTIONS`, `PLAY_OUTCOME_LABELS`, `PLAY_OUTCOME_COLORS`, `HIT_OUTCOMES`, `OUT_OUTCOMES`, `WALK_OUTCOMES`, `BASERUNNING_OUTCOMES`, `CONSENSUS_LABELS`, `CONSENSUS_COLORS` |
| `types/database.ts` | `Profile`, `League`, `Team`, `Field`, `UserRole`, `SignupCode`, `Game`, `GameWithTeams`, `RosterEntry`, `RosterEntryWithProfile`, `DepthChartEntry`, `StandardLineupEntry` |
| `types/scoring.ts` | `ScorekeeperAssignment`, `GameLineupEntry`, `BaseRunners`, `RunnerMovement`, `GameEvent`, `GameState` |

---

## External Services

| Service | Phase | Purpose |
|---------|-------|---------|
| Supabase | 1+ | Database, auth, storage, realtime |
| Expo EAS | 1+ | Mobile builds and OTA updates |
| Resend/SendGrid | 12 | Transactional email |
| DocuSign | 12 | Document signing |
| Stripe | 14 | Payment processing |
