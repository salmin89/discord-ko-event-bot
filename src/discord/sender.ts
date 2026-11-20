import type { Client } from 'discord.js';
import type { Sender } from '../scheduler.ts';

export function makeDiscordSender(client: Pick<Client, 'users'>): Sender {
  return async (userId, content) => {
    const user = await client.users.fetch(userId);
    await user.send({ content, allowedMentions: { parse: [] } });
  };
}
