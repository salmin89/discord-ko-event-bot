# KO Event Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Discord bot that tracks Knight Online event schedules across timezones and DMs members personal reminders before events they subscribe to.

**Architecture:** A single always-on Node process using discord.js for slash commands and a 1-minute internal scheduler for reminders. Pure domain logic (timezone math, recurrence, due-reminder computation, admin checks) is isolated from Discord and SQLite so it is unit-testable; command handlers are pure functions that take parsed input + repositories and return a reply payload, with a thin Discord binding on top.

**Tech Stack:** TypeScript on Node.js 22, discord.js v14, better-sqlite3, luxon (timezone/DST math), run with `tsx` in dev, bundled with `esbuild`, linted with oxlint, tested with the Node built-in test runner (`node:test`). Deployed on Fly.io with a persistent volume.

**Spec:** `docs/superpowers/specs/2026-11-20-ko-event-bot-design.md`

## Global Constraints

- **Node.js 22+** (stable `node:test`, used as the test runner).
- **No Vite.** Dev via `tsx`, build via `esbuild`, lint via `oxlint`.
- **discord.js v14**, application (slash) commands only.
- **better-sqlite3** (synchronous) over a file on the Fly volume; tests use an in-memory database (`:memory:`).
- **luxon** for all timezone and DST arithmetic — never hand-rolled date math.
- All instants stored as **UTC epoch milliseconds (integer)**. Timezones stored as **IANA names** (strings).
- esbuild builds app code to `dist/index.js` with `--packages=external` (native/addon deps stay in `node_modules`); production runs `node dist/index.js`.
- **Reminders are DMs only.** No channel pings, no `@everyone`, ever.
- The Discord bot token comes from the `DISCORD_TOKEN` env var (Fly secret); never committed.
- Default lead times: **60 and 10 minutes**. Lead times are capped at **24 hours** (1440 min).
- No privileged gateway intents (no Server Members intent).

## Review Focus

- **DST transition inside a lead window.** A fixed event at 21:00 server time on a day the clock shifts must still resolve to the correct absolute instant — covered by Task 3 tests.
- **Reminder exactly-once across a process restart.** A reminder already sent before a restart must not re-send; one still due must still fire — covered by Task 6 tests (sent-reminders dedup).
- **Stale reminders after downtime.** On startup, reminders whose moment already passed while the bot was down must be skipped, not fired in a burst — covered by Task 6 tests.
- **Subscribing without a timezone.** A subscribe action by a user with no timezone must be refused with a prompt, never creating a subscription — covered by Task 10 tests.
- **Closed DMs.** A send to a user whose DMs are closed must fail gracefully and be logged, never falling back to a channel ping — covered by Task 13 tests (injected sender that throws).

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `.oxlintrc.json`, `.gitignore`, `src/sanity.ts`, `test/sanity.test.ts`
- Create: `esbuild.mjs`

**Interfaces:**
- Produces: npm scripts `test`, `lint`, `build`, `dev`, `start`; a `sanity()` export used only to prove the toolchain runs.

- [ ] **Step 1: Write the failing test** in `test/sanity.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanity } from '../src/sanity.ts';
test('sanity returns ok', () => { assert.equal(sanity(), 'ok'); });
```

- [ ] **Step 2: Run `npm test`, verify it fails** (module/export missing).
- [ ] **Step 3:** Create `package.json` (type: module, Node 22 engines, deps: `discord.js`, `better-sqlite3`, `luxon`; devDeps: `typescript`, `tsx`, `esbuild`, `oxlint`, `@types/node`, `@types/luxon`), `tsconfig.json` (module/moduleResolution for Node 22, `allowImportingTsExtensions`, strict), `.oxlintrc.json`, `.gitignore` (`node_modules`, `dist`, `*.db`), and `src/sanity.ts` exporting `sanity(): string`. Test command: `node --import tsx --test test/**/*.test.ts`. Build: `esbuild.mjs` bundling `src/index.ts` → `dist/index.js`, platform node, `--packages=external`.
- [ ] **Step 4: Run `npm test`, verify PASS; run `npm run lint` and `npm run build`, verify both succeed.**
- [ ] **Step 5: Commit** `chore: scaffold TypeScript bot project with tooling`.

---

### Task 2: Time formatting and rendering

**Files:**
- Create: `src/domain/time.ts`, `test/domain/time.test.ts`

**Interfaces:**
- Produces: `formatCountdown(ms: number): string` → e.g. `"1h 20m"`, `"45m"`, `"soon"` for <1m; `renderLocal(instantMs: number, tz: string): string` → e.g. `"8:00 PM"`; `isValidTimezone(tz: string): boolean`.

- [ ] **Step 1: Write failing tests** asserting `formatCountdown(4_800_000) === '1h 20m'`, `formatCountdown(2_700_000) === '45m'`, `formatCountdown(30_000) === 'soon'`; `isValidTimezone('America/New_York') === true`, `isValidTimezone('Nowhere/Void') === false`; `renderLocal(instant, 'UTC')` matches the expected clock string (use luxon).
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** the three functions in `src/domain/time.ts` using luxon (`DateTime`, `Duration`, `IANAZone.isValidZone`).
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: timezone rendering and countdown formatting`.

---

### Task 3: Recurrence — next occurrences of a fixed event

**Files:**
- Create: `src/domain/recurrence.ts`, `test/domain/recurrence.test.ts`

**Interfaces:**
- Consumes: luxon.
- Produces: `type Slot = { dayOfWeek: number; time: string }` (dayOfWeek 1–7 = Mon–Sun, time `"HH:mm"`); `nextOccurrences(slots: Slot[], serverTz: string, fromMs: number, windowMs: number): number[]` → sorted UTC-ms instants within `[fromMs, fromMs + windowMs]`.

- [ ] **Step 1: Write failing tests:** a single Fri 21:00 slot in `America/New_York` yields the correct next Friday instant; multiple slots return sorted; a slot on the day of a DST spring-forward resolves to the correct absolute UTC instant (assert exact epoch ms); an empty window yields `[]`.
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** `nextOccurrences` with luxon, iterating days across the window and materializing each slot's instant in `serverTz`.
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: weekly recurrence next-occurrence computation`.

---

<!-- plan-layers:start layer=1 sha=124f8dd76f8c -->

- [ ] **Review — layer 1:** `superpowers:requesting-code-review` on the layer branch, escalating to `/pr-review-multilane` if it is large or risky — or, with neither installed, read the layer's diff before it ships
- [ ] **Layer 1 done** — ask the user: hand layer 2 to a fresh session (`/plan-handoff`, with the layer scope as its out-of-band context) or continue here.

<!-- plan-layers:end -->

### Task 4: Database schema and connection

**Files:**
- Create: `src/db/connection.ts`, `src/db/schema.ts`, `test/db/schema.test.ts`

**Interfaces:**
- Produces: `openDb(path: string): Database` (better-sqlite3 instance with schema applied, foreign keys + WAL on); `applySchema(db: Database): void`. Tables: `guild_config`, `users`, `events`, `event_slots`, `adhoc_times`, `subscriptions`, `sent_reminders` (columns per the spec's data model; all instants INTEGER ms).

- [ ] **Step 1: Write failing test:** `openDb(':memory:')` then query `sqlite_master` and assert every expected table exists.
- [ ] **Step 2: Run test, verify fail.**
- [ ] **Step 3: Implement** `applySchema` (CREATE TABLE IF NOT EXISTS for each, with the columns, PKs, FKs, and a UNIQUE on `sent_reminders(event_id, occurrence_ms, user_id, lead_min)`) and `openDb`.
- [ ] **Step 4: Run test, verify PASS.**
- [ ] **Step 5: Commit** `feat: sqlite schema and connection`.

---

### Task 5: Repositories

**Files:**
- Create: `src/repositories/users.ts`, `src/repositories/guildConfig.ts`, `src/repositories/events.ts`, `src/repositories/subscriptions.ts`, `src/repositories/sentReminders.ts`
- Create: `test/repositories/repositories.test.ts`

**Interfaces:**
- Consumes: `Database` from Task 4; `Slot` from Task 3.
- Produces:
  - users: `setTimezone(db, discordId, tz)`, `getUser(db, discordId): {discordId, timezone} | undefined`.
  - guildConfig: `setChannel(db, guildId, channelId)`, `setServerTz(db, guildId, tz)`, `setAdminRole(db, guildId, roleId)`, `getConfig(db, guildId): GuildConfig | undefined`.
  - events: `createFixedEvent(db, {guildId,name,description,createdBy,defaultSubscribed,slots})`, `createAdhocEvent(db, {guildId,name,createdBy,occurrenceMs,creatorTz})`, `editFixedEvent(...)`, `removeEvent(db, eventId)`, `listEvents(db, guildId): EventRecord[]`, `countActiveAdhocByCreator(db, guildId, createdBy): number`, `getEvent(db, eventId)`, `deleteExpiredAdhoc(db, nowMs)`.
  - subscriptions: `subscribe(db, {userId,eventId,lead1Min,lead2Min})`, `unsubscribe(db, userId, eventId)`, `listSubscriptions(db, userId): Subscription[]`, `listSubscribersForEvent(db, eventId): Subscription[]`, `autoSubscribeToDefaults(db, guildId, userId, defaultLeads)`.
  - sentReminders: `wasSent(db, eventId, occurrenceMs, userId, leadMin): boolean`, `markSent(db, eventId, occurrenceMs, userId, leadMin)`.

- [ ] **Step 1: Write failing tests** against an in-memory db for each repo's round-trip: set/get user timezone; config set/get; create fixed event with slots then `listEvents` returns it with slots; adhoc create + `countActiveAdhocByCreator`; subscribe then `listSubscribersForEvent`; `autoSubscribeToDefaults` subscribes only to `defaultSubscribed` events; `markSent`/`wasSent` dedup; `deleteExpiredAdhoc` removes past adhoc only.
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** each repository with prepared statements. `defaultSubscribed` stored 0/1.
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: data repositories`.

---

### Task 6: Reminder engine (pure)

**Files:**
- Create: `src/domain/reminders.ts`, `test/domain/reminders.test.ts`

**Interfaces:**
- Consumes: `nextOccurrences` (Task 3), event/subscription record shapes (Task 5).
- Produces: `type DueReminder = { userId: string; eventId: string; eventName: string; occurrenceMs: number; leadMin: number }`; `computeDue(params: { nowMs: number; events: EventWithSlots[]; subscriptions: SubscriptionWithUserTz[]; wasSent: (eventId, occurrenceMs, userId, leadMin) => boolean }): DueReminder[]`. Fires a reminder when `nowMs` is within the current minute of `occurrenceMs - leadMin*60000`, the lead ≤ 1440 min, and `wasSent` is false. Reminders whose fire-moment is already in the past (before this minute) are **skipped**, not emitted.

- [ ] **Step 1: Write failing tests:** a sub with lead 60 whose event occurs in 60m is due this minute; one occurring in 90m is not; a reminder already sent (`wasSent` true) is excluded; a fire-moment 5 minutes in the past is skipped (stale-after-downtime); adhoc events (single occurrence) are handled alongside fixed; lead > 1440 is ignored.
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** `computeDue`: for each event compute occurrences in a 1440-min + 1-min look-ahead, for each subscription×lead test the minute window and `wasSent`.
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: pure due-reminder engine with dedup and stale-skip`.

---

<!-- plan-layers:start layer=2 sha=e12c9a7df31f -->

- [ ] **Review — layer 2:** `superpowers:requesting-code-review` on the layer branch, escalating to `/pr-review-multilane` if it is large or risky — or, with neither installed, read the layer's diff before it ships
- [ ] **Layer 2 done** — ask the user: hand layer 3 to a fresh session (`/plan-handoff`, with the layer scope as its out-of-band context) or continue here.

<!-- plan-layers:end -->

### Task 7: Admin permission check

**Files:**
- Create: `src/domain/permissions.ts`, `test/domain/permissions.test.ts`

**Interfaces:**
- Produces: `isAdmin(input: { isGuildOwner: boolean; hasManageGuild: boolean; roleIds: string[]; adminRoleId: string | null }): boolean` → true if owner, or has Manage Server, or holds the configured admin role.

- [ ] **Step 1: Write failing tests** for each path: owner → true; Manage Server → true; holds admin role → true; none, with an admin role set → false; none, with no admin role set → false.
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** `isAdmin` (pure boolean logic).
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: admin permission resolution with bootstrap`.

---

### Task 8: Command handler contracts and "when" parsing

**Files:**
- Create: `src/domain/parseWhen.ts`, `src/handlers/types.ts`, `test/domain/parseWhen.test.ts`

**Interfaces:**
- Produces: `type Reply = { content: string; ephemeral: boolean }`; `parseWhen(input: string, userTz: string, nowMs: number): { ok: true; instantMs: number } | { ok: false; error: string }` for adhoc event times (accepts `"today 20:00"`, `"tomorrow 20:00"`, `"2026-11-22 20:00"`; rejects past/ambiguous with a helpful error).

- [ ] **Step 1: Write failing tests:** `"today 20:00"` in a tz resolves to the correct UTC instant for that day; `"tomorrow 20:00"` is +1 day; an absolute `YYYY-MM-DD HH:mm` parses; a past time returns `ok:false`; garbage returns `ok:false` with an error string.
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** `parseWhen` with luxon in `userTz`; define the `Reply`/handler types.
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: adhoc time parsing and handler reply types`.

---

### Task 9: Timezone + config handlers

**Files:**
- Create: `src/handlers/timezone.ts`, `src/handlers/config.ts`, `src/handlers/legal.ts`, `src/legal/urls.ts`, `test/handlers/timezoneConfig.test.ts`

**Interfaces:**
- Consumes: users/guildConfig repos (Task 5), `isValidTimezone` (Task 2), `isAdmin` (Task 7), `Reply` (Task 8).
- Produces: `handleSetTimezone(db, {discordId, guildId, tz})`, `handleSetChannel`, `handleSetServerTz`, `handleSetAdminRole` (each `(db, adminCtx, args) => Reply`); `handleLegal(): Reply` returning the TOS + Privacy URLs from `LEGAL_URLS` in `src/legal/urls.ts` (`{ tos: string; privacy: string }`). `handleSetTimezone` also calls `autoSubscribeToDefaults` with default leads [60,10].

- [ ] **Step 1: Write failing tests:** setting a valid tz persists and auto-subscribes to default-on events (assert a subscription now exists); invalid tz → error Reply, no write; config handlers reject a non-admin ctx and accept an admin ctx; `handleLegal()` returns a Reply whose content contains both `LEGAL_URLS.tos` and `LEGAL_URLS.privacy`.
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** the handlers, including `src/legal/urls.ts` (`LEGAL_URLS` constant with the GitHub Pages TOS + Privacy URLs) and `handleLegal`.
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: timezone and config command handlers`.

---

### Task 10: Subscription + alerts + timer handlers

**Files:**
- Create: `src/handlers/subscriptions.ts`, `src/handlers/timer.ts`, `test/handlers/subscriptions.test.ts`

**Interfaces:**
- Consumes: subscriptions/users/events repos, `nextOccurrences` (Task 3), `formatCountdown`/`renderLocal` (Task 2).
- Produces: `handleSubscribe(db, {discordId, eventId})`, `handleUnsubscribe(...)`, `handleSetAlerts(db, {discordId, eventId, leads: number[]})` (1–2 leads, each ≤1440), `handleTimer(db, {discordId, nowMs})` → Reply listing subscribed events with countdowns sorted soonest-first in the user's tz.

- [ ] **Step 1: Write failing tests:** subscribe by a user **with no timezone** returns an error Reply and creates no subscription (Review Focus); subscribe with a tz succeeds; `handleSetAlerts` rejects >2 leads and a lead >1440; `handleTimer` renders countdowns in order and in the user's local time; timer for a user with no subscriptions returns a friendly empty Reply.
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** the handlers.
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: subscription, alerts, and live-timer handlers`.

---

<!-- plan-layers:start layer=3 sha=19030f6ed7a4 -->

- [ ] **Review — layer 3:** `superpowers:requesting-code-review` on the layer branch, escalating to `/pr-review-multilane` if it is large or risky — or, with neither installed, read the layer's diff before it ships
- [ ] **Layer 3 done** — ask the user: hand layer 4 to a fresh session (`/plan-handoff`, with the layer scope as its out-of-band context) or continue here.

<!-- plan-layers:end -->

### Task 11: Event management handlers (fixed + adhoc)

**Files:**
- Create: `src/handlers/events.ts`, `test/handlers/events.test.ts`

**Interfaces:**
- Consumes: events repo, `isAdmin` (Task 7), `parseWhen` (Task 8), `Slot` (Task 3).
- Produces: `handleEventAdd`/`handleEventEdit`/`handleEventRemove` (admin-only, fixed events incl. `defaultSubscribed` + slots); `handleAdhocAdd(db, {discordId, guildId, name, when, userTz, nowMs})` (enforces cap 3 for non-admin, unlimited for admin); `handleAdhocRemove(db, {discordId, eventId, isAdmin})` (creator or admin only); `handleListEvents(db, {discordId, guildId, nowMs})`.

- [ ] **Step 1: Write failing tests:** admin adds a fixed event with slots and default-subscribed; non-admin add is rejected; adhoc add by a non-admin at the cap (3 active) is rejected, admin is not; adhoc remove by a non-creator non-admin is rejected; `handleListEvents` shows fixed + active adhoc with the caller's subscription state, in their tz.
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** the handlers.
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: fixed and adhoc event management handlers`.

---

### Task 12: Discord command definitions and dispatch

**Files:**
- Create: `src/discord/commands.ts`, `src/discord/dispatch.ts`, `src/discord/context.ts`, `test/discord/commands.test.ts`

**Interfaces:**
- Consumes: all handlers (Tasks 9–11).
- Produces: `buildCommands(): SlashCommandBuilder[]` (the full command set per the spec, including `/legal`); `buildAdminCtx(interaction, guildConfig)` → the `{isGuildOwner,hasManageGuild,roleIds,adminRoleId}` shape for Task 7; `dispatch(interaction, db)` routing each command/subcommand to its handler (`/legal` → `handleLegal` from Task 9) and replying with the returned `Reply` (ephemeral honored).

- [ ] **Step 1: Write failing tests** (no live gateway): `buildCommands()` includes every expected command name and required options (including `legal`); `buildAdminCtx` maps a fake interaction's owner/permission/roles correctly.
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** `buildCommands`, `buildAdminCtx`, and `dispatch` (a switch mapping to handlers; thin, I/O-only parts untested).
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: slash command definitions and dispatch`.

---

### Task 13: Scheduler tick and DM sender

**Files:**
- Create: `src/scheduler.ts`, `src/discord/sender.ts`, `test/scheduler.test.ts`

**Interfaces:**
- Consumes: `computeDue` (Task 6), repos (Task 5), `renderLocal` (Task 2).
- Produces: `type Sender = (userId: string, content: string) => Promise<void>`; `tick(db, nowMs, send: Sender): Promise<void>` — loads events + subscriptions (+ each subscriber's tz), calls `computeDue`, sends each due reminder as a DM, and `markSent` only on success; `startScheduler(db, send)` sets the 60s interval; `makeDiscordSender(client): Sender`.

- [ ] **Step 1: Write failing tests:** `tick` sends a due reminder once and marks it sent; a second `tick` the same minute does not resend; a `send` that **throws** (closed DMs) is caught, logged, and does **not** `markSent`, with no channel fallback (Review Focus); reminder text contains the event name and the local start time.
- [ ] **Step 2: Run tests, verify fail.**
- [ ] **Step 3: Implement** `tick`, `startScheduler`, `makeDiscordSender` (DM via `user.send`).
- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** `feat: reminder scheduler and DM sender`.

---

### Task 14: Entry point, config loading, command registration

**Files:**
- Create: `src/index.ts`, `src/config.ts`, `test/config.test.ts`

**Interfaces:**
- Consumes: everything.
- Produces: `loadConfig(env): { token: string; dbPath: string }` (throws if `DISCORD_TOKEN` missing); `src/index.ts` opens the db, creates the client (default + guilds intents only), registers slash commands on ready, wires `dispatch` to `interactionCreate`, starts the scheduler, and runs `deleteExpiredAdhoc` on each tick.

- [ ] **Step 1: Write failing test:** `loadConfig` throws without a token, returns values with one; `dbPath` defaults sensibly and honors `DB_PATH`.
- [ ] **Step 2: Run test, verify fail.**
- [ ] **Step 3: Implement** `loadConfig` and `src/index.ts` wiring.
- [ ] **Step 4: Run test, verify PASS; run `npm run build`, verify `dist/index.js` is produced.**
- [ ] **Step 5: Commit** `feat: entry point, config, and wiring`.

---

<!-- plan-layers:start layer=4 sha=621aa391a077 -->

- [ ] **Review — layer 4:** `superpowers:requesting-code-review` on the layer branch, escalating to `/pr-review-multilane` if it is large or risky — or, with neither installed, read the layer's diff before it ships
- [ ] **Layer 4 done** — ask the user: hand layer 5 to a fresh session (`/plan-handoff`, with the layer scope as its out-of-band context) or continue here.

<!-- plan-layers:end -->

### Task 15: Fly.io deployment files and README

**Files:**
- Create: `Dockerfile`, `fly.toml`, `.dockerignore`, `README.md`

**Interfaces:**
- Consumes: the build output.
- Produces: a deployable image and setup docs.

- [ ] **Step 1:** Write `Dockerfile` (node:22-slim base; `npm ci`, `npm run build`; build-essential for better-sqlite3; `CMD ["node","dist/index.js"]`), `fly.toml` (one shared-cpu machine, a `[mounts]` volume for the db, `DB_PATH` env pointing at it, no public HTTP service), `.dockerignore`, and `README.md` (create the Discord app/bot, invite scopes `bot applications.commands`, `fly launch`/`fly volumes create`/`fly secrets set DISCORD_TOKEN`, first-run config commands). No automated test; verify by `npm run build` and `docker build .` if available.
- [ ] **Step 2: Verify** `npm run build` succeeds and the Dockerfile builds (or document the command if Docker is unavailable locally).
- [ ] **Step 3: Commit** `chore: Fly.io deploy config and README`.

---

### Task 16: Static legal site (TOS + Privacy) on GitHub Pages

**Files:**
- Create: `site/index.html`, `site/tos.html`, `site/privacy.html`, `site/style.css`
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`, `src/legal/urls.ts`

**Interfaces:**
- Consumes: `LEGAL_URLS` (Task 9) — the published page URLs.
- Produces: a GitHub Pages site; no runtime code.

- [ ] **Step 1:** Create `site/` with plain static `index.html` (links to both), `tos.html`, `privacy.html`, and `style.css`. The Privacy Policy states what the bot stores (Discord user id, timezone, subscriptions) and that it sends DMs.
- [ ] **Step 2:** Create `.github/workflows/pages.yml` — a GitHub Pages workflow (`actions/upload-pages-artifact` of the `site/` directory + `actions/deploy-pages`) on push to the default branch.
- [ ] **Step 3:** Set the real published URLs in `src/legal/urls.ts` (`https://<user>.github.io/<repo>/tos.html` and `/privacy.html`); add a README section on enabling Pages and pasting the two URLs into the Discord Developer Portal's Terms-of-Service and Privacy-Policy fields.
- [ ] **Step 4: Verify** `npm test` still passes (the `handleLegal` test from Task 9 now points at real URLs) and the HTML pages open locally.
- [ ] **Step 5: Commit** `feat: static TOS and Privacy pages on GitHub Pages`.

<!-- plan-layers:start layer=5 sha=2a8cf6761a50 -->

- [ ] **Review — layer 5:** `superpowers:requesting-code-review` on the layer branch, escalating to `/pr-review-multilane` if it is large or risky — or, with neither installed, read the layer's diff before it ships

<!-- plan-layers:end -->

## Delivery

Generated by `plan-layers`. Re-run it to regenerate — edits inside this
section, or inside a `plan-layers` marked block, are overwritten.

| Layer | Tasks | Est. LOC | Base | Branch | Ships |
| --- | --- | --- | --- | --- | --- |
| 1 | 1–3 | 1320 | default branch | `feat/layer-1-foundation-domain` | Scaffold + time & recurrence domain |
| 2 | 4–6 | 1320 | `feat/layer-1-foundation-domain` | `feat/layer-2-persistence-reminders` | Persistence + reminder engine |
| 3 | 7–10 | 1560 | `feat/layer-2-persistence-reminders` | `feat/layer-3-command-handlers` | Permissions + timezone/config/opt-in handlers |
| 4 | 11–14 | 1440 | `feat/layer-3-command-handlers` | `feat/layer-4-discord-runtime` | Event handlers + Discord wiring, scheduler & runtime |
| 5 | 15–16 | 1320 | `feat/layer-4-discord-runtime` | `feat/layer-5-deploy-legal` | Fly.io deploy, README & static legal site |

```text
default branch
 └── feat/layer-1-foundation-domain       layer 1 of 5 · 1320 LOC · Scaffold + time & recurrence domain
  └── feat/layer-2-persistence-reminders  layer 2 of 5 · 1320 LOC · Persistence + reminder engine
   └── feat/layer-3-command-handlers      layer 3 of 5 · 1560 LOC · Permissions + timezone/config/opt-in handlers
    └── feat/layer-4-discord-runtime      layer 4 of 5 · 1440 LOC · Event handlers + Discord wiring, scheduler & runtime
     └── feat/layer-5-deploy-legal        layer 5 of 5 · 1320 LOC · Fly.io deploy, README & static legal site
```

Five layers at the 1440-LOC window: L1 toolchain plus the pure time/recurrence domain; L2 persistence and the reminder engine; L3 permissions and the read/opt-in command handlers (incl. /legal); L4 the event handlers with the Discord wiring, scheduler and entry point, where the bot first runs end-to-end; L5 the Fly.io deploy plus the static TOS/Privacy site on GitHub Pages, where the bot goes live and legal pages publish. Every code layer is verified by its own test suite and merges green. L3's 1560 estimate is one file over the window, but two of its files are a tiny constants module and a one-line handler, so the real layer fits; the user approved this boundary. Handlers split at T10/T11 only because the full set exceeds the window.
