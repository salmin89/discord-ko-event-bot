import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export function buildCommands(): SlashCommandBuilder[] {
  const eventOpt = (o: any) => o.setName('event').setDescription('Event id').setRequired(true).setMinValue(1);

  const timezone = new SlashCommandBuilder().setName('timezone').setDescription('Your timezone')
    .addSubcommand((s) => s.setName('set').setDescription('Set your timezone')
      .addStringOption((o) => o.setName('tz').setDescription('IANA name, e.g. Europe/Berlin').setRequired(true)));

  const events = new SlashCommandBuilder().setName('events').setDescription('List events');

  const subscribe = new SlashCommandBuilder().setName('subscribe').setDescription('Subscribe to an event')
    .addIntegerOption(eventOpt);
  const unsubscribe = new SlashCommandBuilder().setName('unsubscribe').setDescription('Unsubscribe from an event')
    .addIntegerOption(eventOpt);

  const alerts = new SlashCommandBuilder().setName('alerts').setDescription('Set alert times for an event')
    .addIntegerOption(eventOpt)
    .addIntegerOption((o) => o.setName('first').setDescription('Minutes before the event').setRequired(true).setMinValue(0).setMaxValue(1440))
    .addIntegerOption((o) => o.setName('second').setDescription('Second alert, minutes before').setMinValue(0).setMaxValue(1440));

  const timer = new SlashCommandBuilder().setName('timer').setDescription('Time left for your events');

  const adhoc = new SlashCommandBuilder().setName('adhoc').setDescription('One-time events')
    .addSubcommand((s) => s.setName('add').setDescription('Add a one-time event')
      .addStringOption((o) => o.setName('name').setDescription('Event name').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('when').setDescription('Time in your timezone').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a one-time event')
      .addIntegerOption(eventOpt));

  const slotsOpt = (required: boolean) => (o: any) =>
    o.setName('slots').setDescription('Example: Mon 20:00, Thu 18:30').setRequired(required);
  const event = new SlashCommandBuilder().setName('event').setDescription('Manage fixed events (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('add').setDescription('Add a fixed event')
      .addStringOption((o) => o.setName('name').setDescription('Event name').setRequired(true).setMaxLength(100))
      .addStringOption(slotsOpt(true))
      .addStringOption((o) => o.setName('description').setDescription('Description'))
      .addBooleanOption((o) => o.setName('default_subscribed').setDescription('Subscribe new users by default')))
    .addSubcommand((s) => s.setName('edit').setDescription('Edit a fixed event')
      .addIntegerOption(eventOpt)
      .addStringOption((o) => o.setName('name').setDescription('New name').setMaxLength(100))
      .addStringOption(slotsOpt(false))
      .addStringOption((o) => o.setName('description').setDescription('New description'))
      .addBooleanOption((o) => o.setName('default_subscribed').setDescription('Subscribe new users by default')))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove an event')
      .addIntegerOption(eventOpt));

  const config = new SlashCommandBuilder().setName('config').setDescription('Server settings (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('channel').setDescription('Set the reminder channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true)))
    .addSubcommand((s) => s.setName('servertz').setDescription('Set the server timezone')
      .addStringOption((o) => o.setName('tz').setDescription('IANA name').setRequired(true)))
    .addSubcommand((s) => s.setName('adminrole').setDescription('Set the admin role')
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)));

  const legal = new SlashCommandBuilder().setName('legal').setDescription('Terms of Service and Privacy Policy');

  return [timezone, events, subscribe, unsubscribe, alerts, timer, adhoc, event, config, legal] as SlashCommandBuilder[];
}
