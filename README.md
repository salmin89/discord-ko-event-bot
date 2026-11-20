# KO Event Bot

A Discord bot that sends reminders for game events. It holds a Discord gateway connection and stores data in SQLite.

## 1. Create the Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Open the **Bot** page. Click **Reset Token** and copy the token. Keep it secret.
3. Do not enable any privileged intents. The bot does not need them.
4. Open **OAuth2 > URL Generator**. Select the scopes `bot` and `applications.commands`.
5. Open the generated URL and invite the bot to your server.

## 2. Local development

```sh
npm install
export DISCORD_TOKEN=your-token
npm run dev
```

The database file is `./data/ko-bot.db`. Set `DB_PATH` to change it.
Other commands: `npm test`, `npm run lint`, `npm run build`.

## 3. Deploy to Fly.io

```sh
flyctl auth login
flyctl apps create <name>
flyctl volumes create data --size 1 --region <region>
flyctl secrets set DISCORD_TOKEN=your-token
flyctl deploy
```

- If you pick a new app name, update `app` in `fly.toml`.
- The volume `data` is mounted at `/data`. The database is `/data/ko-bot.db`.
- The bot is not a web server. `fly.toml` has no public service.
- Use one machine only. A volume can attach to one machine. Run `flyctl scale count 1` after deploy.
- Do not use `flyctl launch`. It can overwrite `fly.toml` or add an http_service. If you use it, keep the existing `fly.toml`.

## Legal pages

The `site/` folder holds the Terms of Service and Privacy Policy pages. The workflow `.github/workflows/pages.yml` publishes them with GitHub Pages when you push to `main`.

**This repo is PRIVATE. Free GitHub Pages will not serve a private repo.** To get working legal links, do one of these:

1. Make the repo public.
2. Deploy the `site/` folder to a free static host (for example Cloudflare Pages or Netlify). Then update `LEGAL_URLS` in `src/legal/urls.ts` to the new URLs.

Then paste the Terms of Service URL and the Privacy Policy URL into the Terms of Service and Privacy Policy URL fields in the Discord Developer Portal. The `/legal` command returns the same URLs.

## 4. First-run setup

Run these commands in your Discord server:

1. `/config channel` - set the channel for reminders.
2. `/config servertz` - set the server timezone (IANA name, for example `Europe/Berlin`).
3. `/config adminrole` - set the admin role.

Until an admin role is set, admins are all members who have the **Manage Server** permission.

## 5. Slash commands

User commands:
- `/timezone set` - set your timezone.
- `/events` - list events.
- `/subscribe`, `/unsubscribe` - join or leave an event.
- `/alerts` - set alert times for an event.
- `/timer` - show time left for your events.
- `/adhoc add`, `/adhoc remove` - manage one-time events.
- `/legal` - Terms of Service and Privacy Policy.

Admin commands:
- `/event add`, `/event edit`, `/event remove` - manage fixed events.
- `/config channel`, `/config servertz`, `/config adminrole` - server settings.
