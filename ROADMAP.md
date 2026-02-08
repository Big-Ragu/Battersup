# BattersUp — Development Roadmap

> Baseball League Management App
> Last updated: 2026-02-07

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm |
| Web | Next.js 16 (App Router) + Tailwind CSS 4 |
| Mobile | Expo 54 (React Native) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime |
| Payments | Stripe (Phase 14) |
| Email | Resend or SendGrid (Phase 12) |
| Documents | DocuSign API (Phase 12) |

## Roles
Commissioner · Manager · Coach · Player · Parent · Fan

---

## Phase 1: Foundation
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

---

## Phase 2: Commissioner Dashboard
> League, team, field, and signup code management

- [x] Commissioner overview/home page
- [x] League creation form
- [x] League edit/update form
- [x] League list view
- [x] Team creation form (name, color picker, logo upload)
- [x] Team edit/update form
- [x] Team list view
- [x] Field creation form (name, address, diamond count)
- [x] Field edit/update form
- [x] Field list view
- [x] Signup code generator (role, team, max uses, expiration)
- [x] Signup code list with copy-to-clipboard
- [x] Signup code deactivation
- [x] Role-based route protection (commissioner-only pages)
- [ ] Mobile: Commissioner dashboard screens
- [ ] **CHECKPOINT: Review & tweak Phase 2 before moving on**

---

## Phase 3: Registration & Role Assignment
> Signup code redemption, role assignment, parent-player linking

- [x] "Join League" page for existing users
- [x] Code validation logic (expiration, max uses)
- [x] Code redemption → auto-assign role + league + team
- [ ] Parent-player linking (parent registers child or links to existing player) *(deferred — table created, UI needs UX design)*
- [x] `player_parents` database table + migration
- [x] Commissioner: member list per league
- [x] Commissioner: manual role assignment
- [x] Commissioner: remove member from league
- [ ] Mobile: Join league screen
- [ ] Mobile: Parent-player linking
- [ ] **CHECKPOINT: Review & tweak Phase 3 before moving on**

---

## Phase 4: Team Management
> Rosters, positions, jersey numbers

- [x] `roster_entries` database table + migration
- [x] Team roster page (all players)
- [x] Player card (position, jersey number, contact info)
- [x] Coach: assign positions and jersey numbers
- [x] Coach: set player status (active/inactive/injured)
- [x] Manager: move players between teams
- [x] Team directory (all teams in league)
- [x] Baseball positions constant (`packages/shared`)
- [ ] Mobile: Team roster screen
- [ ] Mobile: Player detail screen
- [ ] **CHECKPOINT: Review & tweak Phase 4 before moving on**

---

## Phase 5: Scheduling
> League schedule creation, calendar views

- [x] `games` database table + migration
- [x] Schedule builder (auto round-robin generator)
- [x] Manual game creation form (home/away, date, time, field)
- [x] Calendar view (month/week)
- [x] Schedule list view (upcoming + past)
- [x] Filter by team
- [x] Field availability/conflict detection
- [x] Game detail page
- [x] Game status management (scheduled → in_progress → final)
- [ ] Mobile: Schedule/calendar screen
- [ ] Mobile: Game detail screen
- [ ] **CHECKPOINT: Review & tweak Phase 5 before moving on**

---

## Phase 6: Live Game Scoring
> Play-by-play scoring, real-time scoreboard

- [ ] `game_lineups` database table + migration
- [ ] `game_innings` database table + migration
- [ ] `at_bats` database table + migration
- [ ] Pre-game lineup setter (batting order, fielding positions)
- [ ] Play-by-play scoring interface
- [ ] At-bat outcome tracking (single, double, HR, strikeout, walk, etc.)
- [ ] Run/out/base-runner tracking per inning
- [ ] Live scoreboard with Supabase Realtime
- [ ] Box score view (innings, hits, runs, errors)
- [ ] Game summary page
- [ ] End game flow (finalize score)
- [ ] Mobile: Scoring interface (optimized for phone)
- [ ] Mobile: Live scoreboard
- [ ] **CHECKPOINT: Review & tweak Phase 6 before moving on**

---

## Phase 7: Stats & Leaderboards
> Personal stats, team stats, league leaderboards

- [ ] Batting stats view (AVG, HR, RBI, OBP, SLG, etc.)
- [ ] Team stats aggregation (W/L, PCT, GB, RS, RA)
- [ ] Player stats page
- [ ] Team stats page
- [ ] League leaderboard page (sortable columns)
- [ ] Season-over-season tracking
- [ ] Stats dashboard widgets
- [ ] Stat calculation utilities (`packages/shared`)
- [ ] Mobile: Player stats screen
- [ ] Mobile: Leaderboard screen
- [ ] **CHECKPOINT: Review & tweak Phase 7 before moving on**

---

## Phase 8: Communication
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
- [ ] **CHECKPOINT: Review & tweak Phase 8 before moving on**

---

## Phase 9: Digital Awards
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
- [ ] **CHECKPOINT: Review & tweak Phase 9 before moving on**

---

## Phase 10: Playoffs
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
- [ ] **CHECKPOINT: Review & tweak Phase 10 before moving on**

---

## Phase 11: Commissioner Admin Tools
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
- [ ] **CHECKPOINT: Review & tweak Phase 11 before moving on**

---

## Phase 12: Email & DocuSign
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
- [ ] **CHECKPOINT: Review & tweak Phase 12 before moving on**

---

## Phase 13: Video & Media
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
- [ ] **CHECKPOINT: Review & tweak Phase 13 before moving on**

---

## Phase 14: Premium Content Store
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
- [ ] **CHECKPOINT: Review & tweak Phase 14 before launch**

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `turbo.json` | Monorepo task orchestration |
| `pnpm-workspace.yaml` | Workspace package definitions |
| `packages/shared/src/constants/roles.ts` | Role definitions + nav config |
| `packages/shared/src/types/database.ts` | TypeScript DB types |
| `packages/supabase/src/types.ts` | Supabase Database interface |
| `packages/supabase/migrations/` | SQL migrations |
| `apps/web/src/lib/supabase/` | Supabase client (browser, server, middleware) |
| `apps/web/src/app/(auth)/` | Auth pages (login, register, callback) |
| `apps/web/src/app/(dashboard)/` | Dashboard pages |
| `apps/web/src/components/sidebar.tsx` | Role-based sidebar navigation |
| `apps/mobile/lib/auth-context.tsx` | Mobile auth state management |
| `apps/mobile/lib/supabase.ts` | Mobile Supabase client |

## External Services

| Service | Phase | Purpose |
|---------|-------|---------|
| Supabase | 1+ | Database, auth, storage, realtime |
| Expo EAS | 1+ | Mobile builds and OTA updates |
| Resend/SendGrid | 12 | Transactional email |
| DocuSign | 12 | Document signing |
| Stripe | 14 | Payment processing |
