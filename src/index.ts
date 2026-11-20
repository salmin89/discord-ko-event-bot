import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { loadConfig } from './config.ts';
import { openDb } from './db/connection.ts';
import { buildCommands } from './discord/commands.ts';
import { dispatch } from './discord/dispatch.ts';
import { makeDiscordSender } from './discord/sender.ts';
import { deleteExpiredAdhoc } from './repositories/events.ts';
import { startScheduler } from './scheduler.ts';

const TICK_MS = 60_000;

const { token, dbPath } = loadConfig(process.env);
mkdirSync(dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

// Only the non-privileged Guilds intent. No Server Members or Message Content intents.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(c.user.id), {
      body: buildCommands().map((cmd) => cmd.toJSON()),
    });
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Slash command registration failed:', err);
  }
});

client.on('interactionCreate', (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  dispatch(interaction, db).catch((err) => console.error('dispatch failed:', err));
});

// Reminder scheduler, and expired ad hoc event cleanup at the same one-minute rate.
startScheduler(db, makeDiscordSender(client));
function cleanup(): void {
  try {
    deleteExpiredAdhoc(db, Date.now());
  } catch (err) {
    console.error('Ad hoc cleanup failed:', err);
  }
}
cleanup();
setInterval(cleanup, TICK_MS);

await client.login(token);
