const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const TOKEN = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

/**
 * UPDATED: Professional Event Types
 */
const EVENT_TYPES = ['meeting', 'workshop', 'social', 'presentation', 'other'];

// In-memory storage
const activeEvents = {};
const activePolls = {};
const activeGiveaways = {};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseMultiline(str) {
  return str.replace(/\\n/g, '\n');
}

function parseColor(hex) {
  if (!hex) return 0x5865F2;
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return isNaN(num) ? 0x5865F2 : num;
}

// ─── Embed Builders ────────────────────────────────────────────────────────────

function buildEventEmbed(eventType, status, time, host, notes) {
  const icons = { meeting: '📅', workshop: '🛠️', social: '🤝', presentation: '📊', other: '✨' };
  const icon = icons[eventType.toLowerCase()] || '🗓️';
  const registrationStatus = status.toLowerCase() === 'open' ? '🟢 Accepting Entries' : '🔴 Capacity Reached';

  const embed = new EmbedBuilder()
    .setTitle(`${icon} New Event: ${eventType.toUpperCase()}`)
    .setColor(status.toLowerCase() === 'open' ? 0x57F287 : 0xED4245)
    .addFields(
      { name: 'Category', value: eventType.charAt(0).toUpperCase() + eventType.slice(1), inline: true },
      { name: 'Status', value: registrationStatus, inline: true },
      { name: 'Scheduled Time', value: time, inline: true },
      { name: 'Organizer', value: `<@${host.id}>`, inline: true }
    )
    .setFooter({ text: 'Corporate Event Management System' })
    .setTimestamp();

  if (notes) embed.addFields({ name: 'Details', value: notes });

  return { embeds: [embed] };
}

// ─── Command Definitions ───────────────────────────────────────────────────────

const commands = [
  // ── /hostevent (Modified for general organization) ──────────────────────────
  new SlashCommandBuilder()
    .setName('hostevent')
    .setDescription('Create a new scheduled event')
    .addStringOption(o =>
      o.setName('type').setDescription('Category of the event').setRequired(true)
        .addChoices(
          { name: '📅 Meeting', value: 'meeting' },
          { name: '🛠️ Workshop', value: 'workshop' },
          { name: '🤝 Social', value: 'social' },
          { name: '📊 Presentation', value: 'presentation' },
          { name: '✨ Other', value: 'other' }
        )
    )
    .addStringOption(o =>
      o.setName('registration').setDescription('Is registration open?').setRequired(true)
        .addChoices(
          { name: '🟢 Open', value: 'open' },
          { name: '🔴 Closed', value: 'closed' }
        )
    )
    .addStringOption(o => o.setName('time').setDescription('Date and Time (e.g., Oct 12, 3:00 PM)').setRequired(true))
    .addStringOption(o => o.setName('details').setDescription('Additional event description').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  // ── /eventinfo ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('eventinfo')
    .setDescription('Display details of the current active event'),

  // ── /register ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('register')
    .setDescription('Register your attendance for the current event'),

  // ── /cancel_registration ─────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('cancel_registration')
    .setDescription('Remove your name from the event attendee list'),

  // ── /attendees ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('attendees')
    .setDescription('View the list of registered attendees'),

  // ── /announce ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send a professional announcement')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('Message body. Use \\n for new lines.').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Optional header').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

].map(cmd => cmd.toJSON());

// ─── Interaction Handler ───────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId, options, user } = interaction;
  const event = activeEvents[guildId];

  // --- Host Event ---
  if (commandName === 'hostevent') {
    const type = options.getString('type');
    const registration = options.getString('registration');
    const time = options.getString('time');
    const details = options.getString('details') ?? '';

    activeEvents[guildId] = { 
      type, 
      registration, 
      time, 
      host: user, 
      attendees: [], 
      details 
    };

    return interaction.reply(buildEventEmbed(type, registration, time, user, details));
  }

  // --- Register ---
  if (commandName === 'register') {
    if (!event) return interaction.reply({ content: '❌ No active event found.', ephemeral: true });
    if (event.registration !== 'open') return interaction.reply({ content: '❌ Registration is currently closed.', ephemeral: true });
    
    if (event.attendees.some(u => u.id === user.id)) {
      return interaction.reply({ content: 'ℹ️ You are already registered.', ephemeral: true });
    }

    event.attendees.push({ id: user.id, tag: user.tag });
    return interaction.reply({ 
      content: `✅ <@${user.id}>, your registration for the **${event.type}** has been confirmed.`, 
      ephemeral: true 
    });
  }

  // --- Attendees ---
  if (commandName === 'attendees') {
    if (!event) return interaction.reply({ content: '❌ No active event.', ephemeral: true });
    
    const list = event.attendees.length > 0 
      ? event.attendees.map((u, i) => `${i + 1}. <@${u.id}>`).join('\n')
      : 'No attendees registered yet.';

    const embed = new EmbedBuilder()
      .setTitle(`Attendee List: ${event.type.toUpperCase()}`)
      .setDescription(list)
      .setColor(0x5865F2);

    return interaction.reply({ embeds: [embed] });
  }

  // --- Professional Announcement ---
  if (commandName === 'announce') {
    const channel = options.getChannel('channel');
    const text = parseMultiline(options.getString('text'));
    const title = options.getString('title') ?? 'Internal Announcement';

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(text)
      .setColor(0x5865F2)
      .setFooter({ text: `Issued by ${user.tag}` })
      .setTimestamp();

    try {
      await channel.send({ embeds: [embed] });
      await interaction.reply({ content: '✅ Announcement dispatched.', ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: '❌ Failed to send. Check channel permissions.', ephemeral: true });
    }
  }
});

client.once('ready', async () => {
  console.log(`🚀 Event Manager ready: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (err) {
    console.error(err);
  }
});

client.login(TOKEN);
