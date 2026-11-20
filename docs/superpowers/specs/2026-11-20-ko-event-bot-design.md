# KO Event Bot — Design

Date: 2026-11-20
Status: Draft for approval

## Intent and why

A Discord bot for a Knight Online (USKO) guild whose members live across
many timezones. People keep missing scheduled events — bosses, PK events,
wars — because the official schedule is in one game-server clock and each
member has to convert it in their head. This bot tracks the schedule,
lets each member see it in their own local time, and sends **personal
reminders** before each event so nobody misses what they care about.

Success: a member sets their timezone once, picks the events they care
about, and reliably gets a DM like "1h 20m left until Boss Event" ahead
of time — without the bot ever spamming the channel.

## Goals

- Track the official KO event schedule as **fixed weekly events** (recur
  on set days and times).
- Let **admins** add, edit, and remove fixed events.
- Let **any member** post a shared **ad-hoc event** (a one-off like
  "Mage PK tonight at 8pm"), which others can subscribe to.
- Let each member **set their timezone once**; all times shown and all
  reminders are in that member's local time.
- Let members **opt in / out** of events.
- Per subscribed event, let a member get **up to 2 reminders** at lead
  times they choose (e.g. 60 min and 10 min before).
- Provide a **live timer** command that shows countdowns to upcoming
  subscribed events.
- Keep it **free to run** and low-maintenance.

## Non-goals

- No web dashboard or browser UI. All interaction is through Discord
  slash commands. (This is why the stack has no frontend tooling.)
- No voice-channel features.
- No cross-guild event sharing. The schema is multi-guild-safe, but the
  product is aimed at a single guild's needs.

## Anti-goals (what makes this a failure even if it "works")

- **Becoming spammy.** The bot must never `@everyone` or ping the channel
  for a reminder. Reminders are DMs to subscribers only.
- **Notifying people who did not opt in.** A junk ad-hoc event must bother
  nobody unless they chose to subscribe to it.
- **Missed or duplicated reminders.** A reminder fires once, near the
  right minute. It never double-sends, and it never silently drops.

## Core behavior

### Timezones

- Each user sets their timezone once (IANA name, e.g. `America/New_York`),
  via a command. Until they set it, the bot prompts them to and shows
  times in the server timezone with a note.
- **Setting a timezone is required before subscribing** to anything. Any
  command that creates a subscription first checks the caller has a
  timezone and prompts them to set one if not. This guarantees every
  reminder has a real local time to show — there is no "subscribed but no
  timezone" state. (Builder's call, stated to resolve the ambiguity.)
- Fixed events are **defined in one game-server timezone** (a per-guild
  setting the admin configures, e.g. `America/New_York`).
- Ad-hoc event times are entered and read in the **creator's** timezone,
  then stored as an absolute instant.
- Everything a user sees or is pinged about is rendered in **their** local
  time.

### Events — two kinds

**Fixed weekly events** (admin-managed)
- Have a name, optional description, and a recurrence: one or more
  `(day-of-week, time-of-day)` slots in the server timezone. Example:
  "Forgotten Temple — Fri 21:00, Sat 21:00, Sun 21:00".
- Each fixed event has a **default-subscribed** flag. When an admin adds
  an event with this on, every **known user** (anyone who has used the bot
  — i.e. set their timezone) is auto-subscribed; they can still opt out. A
  new member is auto-subscribed to all current default-on events the first
  time they set their timezone. The bot never enumerates the whole guild
  and never touches people who have not used it, so it never DMs someone
  who never opted in and needs no privileged Server Members intent.
- Admins can add / edit / remove them.

**Ad-hoc events** (member-created)
- A single one-off occurrence with a name and a datetime.
- **Shared**: listed for everyone, and anyone can subscribe.
- Anyone may create one. Guardrails against spam:
  - **Auto-expire**: removed from the active list shortly after the
    occurrence passes.
  - **Cap on active ad-hoc events per creator**: default **3** for
    regular members, **unlimited** for admins.
  - Admins can delete **any** ad-hoc event.
- Never auto-subscribe anyone; always opt-in.

### Subscriptions and alerts

- A member subscribes / unsubscribes per event.
- Per subscription, the member sets **up to 2 lead times** (in minutes
  before the occurrence). Default when they subscribe without choosing:
  **60 min and 10 min** (builder's call; one-click accept). Lead times are
  capped at **24 hours** (builder's call), which also sets the scheduler's
  look-ahead window.
- At each lead time, the bot **DMs** the subscriber: e.g.
  "⏳ 1h left until **Boss Event** (starts 8:00 PM your time)".
- Delivery is **DM only**. No channel pings.
- If a user's DMs are closed, the send fails gracefully and is logged; the
  bot does not fall back to a channel ping.

### Live timer

- A command (e.g. `/timer`) replies — privately to the caller — with a
  list of their upcoming subscribed events and countdowns:
  "**Boss Event** — 1h 20m (8:00 PM)", sorted soonest first.
- Shows the next occurrence of each subscribed event, in the caller's
  local time.

### Channel and config

- The bot operates in **one dedicated channel** per guild, chosen by an
  admin (e.g. `#ko-events`). Slash commands and any event listings live
  there. This keeps general chat clean.
- Per-guild config an admin sets: the dedicated channel, the server
  timezone, and which Discord role counts as "admin" for bot purposes.
- **Admin bootstrap** (resolves the chicken-and-egg of setting the admin
  role via an admin command): a user with Discord's **Manage Server**
  permission (and the guild owner) always counts as an admin, whether or
  not an admin role is configured. The configurable admin role is an
  *additional* grant, so first-run config is always possible. (Builder's
  call, stated here.)

## Slash commands (indicative — final names are the builder's call)

Member:
- `/timezone set <iana-timezone>` — set your timezone.
- `/events` — list fixed + active ad-hoc events, in your local time, with
  your subscription state.
- `/subscribe <event>` / `/unsubscribe <event>`.
- `/alerts <event> <lead1> [lead2]` — set your 1–2 lead times for an event.
- `/timer` — live countdowns to your subscribed events.
- `/adhoc add <name> <when>` / `/adhoc remove <event>` — create/remove a
  shared one-off (removing limited to creator or admin).

Admin:
- `/event add` / `/event edit` / `/event remove` — manage fixed events,
  including their recurrence slots and the default-subscribed flag.
- `/config channel <#channel>` / `/config servertz <tz>` /
  `/config adminrole <role>`.

## Reminder engine

- An **internal scheduler** runs inside the bot process, waking **every
  minute** (not an external cron). This avoids the few-minute drift of
  CI/cron schedulers, so "30m left" fires at ~30m, not 27 or 33.
- Each tick: for every active event occurrence in the near future, for
  every subscription and its lead times, if "now" is within the current
  minute of `occurrence - leadtime` and that exact reminder has **not**
  already been sent, send the DM and record it.
- A **sent-reminders** record (event + occurrence instant + user + lead
  time) guarantees exactly-once delivery across restarts.
- On startup after downtime, the bot does **not** fire reminders whose
  moment already passed while it was down (avoids a burst of stale pings);
  it logs them as missed. (Builder's call; stated here so it is explicit.)

## Technical approach (builder's calls, stated for the record)

- **Language/runtime**: TypeScript on Node.js.
- **Discord**: discord.js v14, application (slash) commands.
- **Dev/build/lint**: run with `tsx` in dev; bundle with `esbuild`; lint
  with **oxc / oxlint**. (No Vite — there is no frontend to serve.)
- **Hosting**: **Fly.io**, a single always-on machine (smallest shared
  CPU). The process stays connected to Discord and runs the scheduler.
- **Storage**: **SQLite** (better-sqlite3) on a **Fly.io persistent
  volume**. Holds users (timezone), events (fixed + ad-hoc),
  subscriptions (with lead times), guild config, and sent-reminders.
- **Secrets**: the Discord bot token via Fly secrets / env, never in the
  repo.

### Rough data model (builder may refine)

- `guild_config(guild_id, channel_id, server_tz, admin_role_id)`
- `users(discord_id, timezone, created_at)`
- `events(id, guild_id, type['fixed'|'adhoc'], name, description,
  created_by, default_subscribed, ... )`
- `event_slots(event_id, day_of_week, time_of_day)` — fixed recurrence
- `adhoc_times(event_id, occurrence_utc, creator_tz)` — single instant
- `subscriptions(user_id, event_id, lead1_min, lead2_min)`
- `sent_reminders(event_id, occurrence_utc, user_id, lead_min)`

## Open for the builder

- Exact slash-command names, option shapes, and reply formatting.
- Natural-language parsing of ad-hoc "when" (e.g. "tonight at 8pm")
  versus a stricter structured input — builder picks the most robust
  approach for the library.
- Precise SQLite schema, migrations, and indexing.
- Fly.io machine size, volume size, and deploy config.
- Logging/observability details.

## Resolved after review (reviewer-check round)

- **Default-subscribed = known users only.** Auto-subscribe applies to
  people who have used the bot (set a timezone), never the whole guild.
  No Server Members intent. (User decision.)
- **Timezone required before subscribing**, so no reminder lacks a local
  time. (Builder's call.)
- **Admin bootstrap** via Discord Manage-Server permission / guild owner
  until an admin role is set. (Builder's call.)
- **Lead times capped at 24h**, sizing the scheduler look-ahead. (Builder's
  call.)

## Legal pages (Terms of Service + Privacy Policy)

- The project ships a small **static site** with two pages — **Terms of
  Service** and **Privacy Policy** — plus a simple index linking both.
- **Hosting (builder's call): GitHub Pages**, published from a `site/`
  folder in this repo by a GitHub Actions workflow. Plain HTML + a little
  shared CSS, no framework or build step. This keeps the legal pages
  versioned in the repo at zero cost and with no extra service.
- **Consequence:** the repo lives on **GitHub** (also what the stacked-PR
  delivery flow needs). The bot itself still deploys to Fly.io.
- **Linked from Discord two ways:** the bot's **Developer Portal** Terms
  of Service URL and Privacy Policy URL fields point at the two pages, and
  the bot offers a **`/legal`** slash command that replies with both links.
- The Privacy Policy states plainly what the bot stores (Discord user id,
  chosen timezone, event subscriptions) and that it sends DMs; the exact
  copy is the builder's to draft from this.

## Attribution

Built with assistance from Claude Code.
