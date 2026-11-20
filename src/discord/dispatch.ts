import type { ChatInputCommandInteraction } from 'discord.js';
import type { Database } from 'better-sqlite3';
import type { Reply } from '../handlers/types.ts';
import { handleSetTimezone } from '../handlers/timezone.ts';
import { handleSetChannel, handleSetServerTz, handleSetAdminRole } from '../handlers/config.ts';
import { handleLegal } from '../handlers/legal.ts';
import { handleSubscribe, handleUnsubscribe, handleSetAlerts } from '../handlers/subscriptions.ts';
import { handleTimer } from '../handlers/timer.ts';
import {
  handleEventAdd, handleEventEdit, handleEventRemove,
  handleAdhocAdd, handleAdhocRemove, handleListEvents,
} from '../handlers/events.ts';
import { isAdmin } from '../domain/permissions.ts';
import { getConfig } from '../repositories/guildConfig.ts';
import { getUser } from '../repositories/users.ts';
import { buildAdminCtx, parseSlots } from './context.ts';

const say = (content: string): Reply => ({ content, ephemeral: true });

export async function route(i: ChatInputCommandInteraction, db: Database): Promise<Reply> {
  if (!i.guildId) return say('Use this command in a server.');
  const guildId = i.guildId;
  const discordId = i.user.id;
  const nowMs = Date.now();
  const adminCtx = () => buildAdminCtx(i as never, getConfig(db, guildId));
  const eventId = () => i.options.getInteger('event', true);
  const userTz = getUser(db, discordId)?.timezone;
  const sub = i.options.getSubcommand(false);

  switch (i.commandName) {
    case 'legal':
      return handleLegal();
    case 'timezone':
      return handleSetTimezone(db, { discordId, guildId, tz: i.options.getString('tz', true) });
    case 'events':
      return handleListEvents(db, { discordId, guildId, nowMs });
    case 'timer':
      return handleTimer(db, { discordId, guildId, nowMs });
    case 'unsubscribe':
      return handleUnsubscribe(db, { discordId, eventId: eventId() });
    case 'subscribe':
    case 'alerts': {
      if (!userTz) return say('Set your timezone first with /timezone set. Then try again.');
      if (i.commandName === 'subscribe') return handleSubscribe(db, { discordId, guildId, eventId: eventId() });
      const leads = [i.options.getInteger('first', true), i.options.getInteger('second')].filter((n) => n !== null);
      return handleSetAlerts(db, { discordId, eventId: eventId(), leads });
    }
    case 'adhoc':
      if (sub === 'remove') {
        return handleAdhocRemove(db, { discordId, guildId, eventId: eventId(), isAdmin: isAdmin(adminCtx()) });
      }
      if (!userTz) return say('Set your timezone first with /timezone set. Then try again.');
      return handleAdhocAdd(db, {
        discordId, guildId, nowMs, userTz,
        name: i.options.getString('name', true),
        when: i.options.getString('when', true),
        isAdmin: isAdmin(adminCtx()),
      });
    case 'event': {
      if (sub === 'remove') return handleEventRemove(db, adminCtx(), { eventId: eventId(), guildId });
      const slotText = i.options.getString('slots', sub === 'add');
      const slots = slotText === null ? undefined : parseSlots(slotText);
      if (slots === null) return say('Slots are not valid. Example: Mon 20:00, Thu 18:30');
      const name = i.options.getString('name');
      const description = i.options.getString('description');
      const defaultSubscribed = i.options.getBoolean('default_subscribed');
      if (sub === 'add') {
        return handleEventAdd(db, adminCtx(), {
          guildId, createdBy: discordId, name: name!, slots: slots!,
          description: description ?? '', defaultSubscribed: defaultSubscribed ?? false,
        });
      }
      return handleEventEdit(db, adminCtx(), {
        eventId: eventId(),
        guildId,
        ...(name !== null && { name }),
        ...(description !== null && { description }),
        ...(defaultSubscribed !== null && { defaultSubscribed }),
        ...(slots !== undefined && { slots }),
      });
    }
    case 'config':
      if (sub === 'channel') return handleSetChannel(db, adminCtx(), { guildId, channelId: i.options.getChannel('channel', true).id });
      if (sub === 'servertz') return handleSetServerTz(db, adminCtx(), { guildId, tz: i.options.getString('tz', true) });
      return handleSetAdminRole(db, adminCtx(), { guildId, roleId: i.options.getRole('role', true).id });
    default:
      return say('Unknown command.');
  }
}

/** Route a slash command to its handler and send the reply. Replies never ping. */
export async function dispatch(i: ChatInputCommandInteraction, db: Database): Promise<void> {
  let reply: Reply;
  try {
    reply = await route(i, db);
  } catch (e) {
    console.error('command failed', e);
    reply = say('Something went wrong. Try again later.');
  }
  await i.reply({ content: reply.content, ephemeral: reply.ephemeral, allowedMentions: { parse: [] } });
}
