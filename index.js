const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const PREFIX = '!';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const EVENT_TYPES = ['pvp', 'recording', 'building'];

// In-memory event state (per guild)
// Structure: { [guildId]: { type, queue, time, host, open, signups: [], notes: '' } }
const activeEvents = {};

// Poll storage: { [guildId]: { question, options: [{label, votes: Set<userId>}], messageId, channelId, active } }
const activePolls = {};

// Giveaway storage: { [guildId]: { prize, endsAt, entries: Set<userId>, messageId, channelId, active } }
const activeGiveaways = {};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseMultiline(str) {
  // Replace literal \n with real newlines
  return str.replace(/\\n/g, '\n');
}

// ─── Embed Builders ────────────────────────────────────────────────────────────

function buildEventEmbed(eventType, queue, time, host) {
  const icons = { pvp: '⚔️', recording: '🎥', building: '🏗️' };
  const icon = icons[eventType.toLowerCase()] || '🎉';
  const queueStatus = queue.toLowerCase() === 'open' ? '🟢 Open' : '🔴 Closed';

  return {
    embeds: [{
      title: `${icon} ${eventType.toUpperCase()} Event`,
      color: queue.toLowerCase() === 'open' ? 0x57F287 : 0xED4245,
      fields: [
        { name: '📋 Event Type', value: eventType.charAt(0).toUpperCase() + eventType.slice(1), inline: true },
        { name: '🚪 Queue', value: queueStatus, inline: true },
        { name: '⏰ Time', value: time, inline: true },
        { name: '👤 Hosted By', value: `<@${host.id}>`, inline: true }
      ],
      footer: { text: 'DisBit Event System' },
      timestamp: new Date().toISOString()
    }]
  };
}

function buildQueueEmbed(event, guildId) {
  const icons = { pvp: '⚔️', recording: '🎥', building: '🏗️' };
  const icon = icons[event.type] || '🎉';
  const signupList = event.signups.length > 0
    ? event.signups.map((u, i) => `\`${i + 1}.\` <@${u.id}> — ${u.tag}`).join('\n')
    : '_No sign-ups yet._';

  return new EmbedBuilder()
    .setTitle(`${icon} ${event.type.toUpperCase()} Event — Sign-up Queue`)
    .setColor(0x5865F2)
    .addFields(
      { name: '⏰ Time', value: event.time, inline: true },
      { name: '👤 Host', value: `<@${event.host.id}>`, inline: true },
      { name: `📋 Sign-ups (${event.signups.length})`, value: signupList }
    )
    .setFooter({ text: 'DisBit Event System' })
    .setTimestamp();
}

// ─── Slash Command Definitions ─────────────────────────────────────────────────

const commands = [

  // ── /announce ────────────────────────────────────────────────────────────────
  // Now supports \n for new lines and an optional embed title
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send an announcement to a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('Announcement text. Use \\n for new lines.').setRequired(true))
    .addBooleanOption(o => o.setName('embed').setDescription('Send as a styled embed? (default: false)').setRequired(false))
    .addStringOption(o => o.setName('title').setDescription('Embed title (only used if embed=true)').setRequired(false))
    .addStringOption(o => o.setName('color').setDescription('Embed color hex e.g. #FF5733 (only used if embed=true)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /hostevent ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('hostevent')
    .setDescription('Host a new event')
    .addStringOption(o =>
      o.setName('type').setDescription('Type of event').setRequired(true)
        .addChoices(
          { name: '⚔️ PvP', value: 'pvp' },
          { name: '🎥 Recording', value: 'recording' },
          { name: '🏗️ Building', value: 'building' }
        )
    )
    .addStringOption(o =>
      o.setName('queue').setDescription('Is the queue open or closed?').setRequired(true)
        .addChoices(
          { name: '🟢 Open', value: 'open' },
          { name: '🔴 Closed', value: 'closed' }
        )
    )
    .addStringOption(o => o.setName('time').setDescription('When is the event? e.g. 5PM EST').setRequired(true))
    .addStringOption(o => o.setName('notes').setDescription('Optional extra notes about the event').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /endevent ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('endevent')
    .setDescription('End the current active event and clear its queue')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /joinevent ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('joinevent')
    .setDescription('Sign up to join the current event'),

  // ── /leaveevent ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('leaveevent')
    .setDescription('Remove yourself from the current event sign-up queue'),

  // ── /viewqueue ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('viewqueue')
    .setDescription('View the current event sign-up queue'),

  // ── /clearqueue ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('clearqueue')
    .setDescription('Clear all sign-ups from the current event queue')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /eventping ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('eventping')
    .setDescription('Ping a role to alert them about the current event')
    .addRoleOption(o => o.setName('role').setDescription('The role to ping').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Optional extra message (use \\n for new lines)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /eventrules ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('eventrules')
    .setDescription('Post the rules for the current event')
    .addStringOption(o => o.setName('rules').setDescription('The rules text (use \\n for new lines)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /eventwinner ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('eventwinner')
    .setDescription('Announce the winner(s) of the current event')
    .addUserOption(o => o.setName('winner1').setDescription('First winner').setRequired(true))
    .addUserOption(o => o.setName('winner2').setDescription('Second winner (optional)').setRequired(false))
    .addUserOption(o => o.setName('winner3').setDescription('Third winner (optional)').setRequired(false))
    .addStringOption(o => o.setName('prize').setDescription('Prize description (optional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /eventcountdown ──────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('eventcountdown')
    .setDescription('Post a countdown message for an upcoming event')
    .addStringOption(o => o.setName('time').setDescription('When is the event? e.g. 30 minutes, 2 hours').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('What is the event?').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /eventinfo ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('eventinfo')
    .setDescription('Display details about the current active event'),

  // ── /eventstatus ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('eventstatus')
    .setDescription('Toggle the queue open or closed for the current event')
    .addStringOption(o =>
      o.setName('status').setDescription('Open or close the queue').setRequired(true)
        .addChoices(
          { name: '🟢 Open', value: 'open' },
          { name: '🔴 Closed', value: 'closed' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /removeuser ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('removeuser')
    .setDescription('Remove a specific user from the event sign-up queue')
    .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /pickwinner ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName('pickwinner')
    .setDescription('Randomly pick a winner from the current event sign-up queue')
    .addIntegerOption(o => o.setName('count').setDescription('How many winners to pick (default: 1)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /eventnotes ──────────────────────────────────────────────────────────────
  // NEW: Update or view notes on the active event
  new SlashCommandBuilder()
    .setName('eventnotes')
    .setDescription('Set or view notes/description for the current event')
    .addStringOption(o => o.setName('notes').setDescription('Notes to attach (use \\n for new lines). Leave blank to view current notes.').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /poll ────────────────────────────────────────────────────────────────────
  // NEW: Create a simple poll (up to 4 options)
  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll for server members to vote on')
    .addStringOption(o => o.setName('question').setDescription('The poll question').setRequired(true))
    .addStringOption(o => o.setName('option1').setDescription('Option 1').setRequired(true))
    .addStringOption(o => o.setName('option2').setDescription('Option 2').setRequired(true))
    .addStringOption(o => o.setName('option3').setDescription('Option 3 (optional)').setRequired(false))
    .addStringOption(o => o.setName('option4').setDescription('Option 4 (optional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /pollresults ─────────────────────────────────────────────────────────────
  // NEW: Show current poll results
  new SlashCommandBuilder()
    .setName('pollresults')
    .setDescription('Show the current poll results')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /endpoll ─────────────────────────────────────────────────────────────────
  // NEW: End the current poll and display final results
  new SlashCommandBuilder()
    .setName('endpoll')
    .setDescription('End the current poll and announce final results')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /giveaway ────────────────────────────────────────────────────────────────
  // NEW: Start a giveaway
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway for server members to enter')
    .addStringOption(o => o.setName('prize').setDescription('What is being given away?').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('How long? e.g. 10m, 1h, 1d').setRequired(true))
    .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default: 1)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /giveawayend ─────────────────────────────────────────────────────────────
  // NEW: End giveaway early and pick winners
  new SlashCommandBuilder()
    .setName('giveawayend')
    .setDescription('End the current giveaway early and pick winners')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /say ─────────────────────────────────────────────────────────────────────
  // NEW: Make the bot say something in a channel (plain text, supports \n)
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot send a message in a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('Message text. Use \\n for new lines.').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /embed ───────────────────────────────────────────────────────────────────
  // NEW: Send a custom fully-configured embed to a channel
  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a fully custom embed to a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Embed description. Use \\n for new lines.').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Hex color e.g. #FF5733 (default: blurple)').setRequired(false))
    .addStringOption(o => o.setName('footer').setDescription('Footer text').setRequired(false))
    .addStringOption(o => o.setName('image').setDescription('Image URL to attach').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /dm ──────────────────────────────────────────────────────────────────────
  // NEW: DM a specific user
  new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Send a DM to a server member (from the bot)')
    .addUserOption(o => o.setName('user').setDescription('User to DM').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message to send. Use \\n for new lines.').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── /serverinfo ──────────────────────────────────────────────────────────────
  // NEW: Display server info
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Display information about this server'),

  // ── /userinfo ────────────────────────────────────────────────────────────────
  // NEW: Display info about a user
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Display information about a user')
    .addUserOption(o => o.setName('user').setDescription('User to look up (defaults to you)').setRequired(false)),

  // ── /reminder ────────────────────────────────────────────────────────────────
  // NEW: Set a reminder that the bot will post in the channel after a delay
  new SlashCommandBuilder()
    .setName('reminder')
    .setDescription('Set a reminder the bot will post in this channel')
    .addStringOption(o => o.setName('time').setDescription('When to remind, e.g. 10m, 1h, 2h30m').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('What to remind about').setRequired(true)),

  // ── /coinflip ────────────────────────────────────────────────────────────────
  // NEW: Flip a coin
  new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flip a coin — heads or tails?'),

  // ── /roll ────────────────────────────────────────────────────────────────────
  // NEW: Roll a dice
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll a dice')
    .addStringOption(o => o.setName('dice').setDescription('Dice notation e.g. d6, d20, 2d6 (default: d6)').setRequired(false)),

  // ── /8ball ───────────────────────────────────────────────────────────────────
  // NEW: Magic 8-ball
  new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the magic 8-ball a question')
    .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),

].map(cmd => cmd.toJSON());

// ─── Ready & Register ──────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`✅ DisBit is online as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registered globally.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

// ─── Helper: Parse duration string to ms ──────────────────────────────────────

function parseDuration(str) {
  const regex = /(\d+)\s*(d|h|m|s)/gi;
  let ms = 0;
  let match;
  const units = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  while ((match = regex.exec(str)) !== null) {
    ms += parseInt(match[1]) * (units[match[2].toLowerCase()] || 0);
  }
  return ms;
}

function formatDuration(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ') || '0s';
}

// ─── Helper: Parse hex color ──────────────────────────────────────────────────

function parseColor(hex) {
  if (!hex) return 0x5865F2;
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return isNaN(num) ? 0x5865F2 : num;
}

// ─── Interaction Handler ───────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;
  const event = activeEvents[guildId];

  // ── /announce ─────────────────────────────────────────────────────────────────
  if (interaction.commandName === 'announce') {
    const targetChannel = interaction.options.getChannel('channel');
    const rawText = interaction.options.getString('text');
    const text = parseMultiline(rawText);
    const useEmbed = interaction.options.getBoolean('embed') ?? false;
    const title = interaction.options.getString('title') ?? '📢 Announcement';
    const colorHex = interaction.options.getString('color');

    if (!targetChannel.isTextBased())
      return interaction.reply({ content: '❌ That channel is not a text channel.', ephemeral: true });

    try {
      if (useEmbed) {
        await targetChannel.send({
          embeds: [{
            title,
            description: text,
            color: parseColor(colorHex),
            footer: { text: `Announced by ${interaction.user.tag}` },
            timestamp: new Date().toISOString()
          }]
        });
      } else {
        await targetChannel.send(text);
      }
      await interaction.reply({ content: `✅ Announcement sent to ${targetChannel}!`, ephemeral: true });
    } catch {
      await interaction.reply({ content: '❌ I don\'t have permission to send messages in that channel.', ephemeral: true });
    }
  }

  // ── /hostevent ────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'hostevent') {
    const eventType = interaction.options.getString('type');
    const queue = interaction.options.getString('queue');
    const time = interaction.options.getString('time');
    const notes = interaction.options.getString('notes') ?? '';

    activeEvents[guildId] = { type: eventType, queue, time, host: interaction.user, signups: [], notes };

    const embed = buildEventEmbed(eventType, queue, time, interaction.user);
    if (notes) embed.embeds[0].fields.push({ name: '📝 Notes', value: notes });
    await interaction.reply(embed);
  }

  // ── /endevent ─────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'endevent') {
    if (!event) return interaction.reply({ content: '❌ There is no active event to end.', ephemeral: true });
    delete activeEvents[guildId];
    await interaction.reply({
      embeds: [{ title: '🛑 Event Ended', description: 'The current event has been ended and the queue has been cleared.', color: 0xED4245, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }]
    });
  }

  // ── /joinevent ────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'joinevent') {
    if (!event) return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });
    if (event.queue !== 'open') return interaction.reply({ content: '❌ The queue for this event is currently **closed**.', ephemeral: true });
    if (event.signups.some(u => u.id === interaction.user.id))
      return interaction.reply({ content: '❌ You are already signed up for this event!', ephemeral: true });
    event.signups.push({ id: interaction.user.id, tag: interaction.user.tag });
    await interaction.reply({
      embeds: [{ title: '✅ Signed Up!', description: `<@${interaction.user.id}> has joined the **${event.type.toUpperCase()}** event queue.\nYou are **#${event.signups.length}** in line.`, color: 0x57F287, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }]
    });
  }

  // ── /leaveevent ───────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'leaveevent') {
    if (!event) return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });
    const idx = event.signups.findIndex(u => u.id === interaction.user.id);
    if (idx === -1) return interaction.reply({ content: '❌ You are not signed up for this event.', ephemeral: true });
    event.signups.splice(idx, 1);
    await interaction.reply({
      embeds: [{ title: '👋 Left Queue', description: `<@${interaction.user.id}> has been removed from the **${event.type.toUpperCase()}** event queue.`, color: 0xFEE75C, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }]
    });
  }

  // ── /viewqueue ────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'viewqueue') {
    if (!event) return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });
    await interaction.reply({ embeds: [buildQueueEmbed(event, guildId)] });
  }

  // ── /clearqueue ───────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'clearqueue') {
    if (!event) return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });
    const count = event.signups.length;
    event.signups = [];
    await interaction.reply({
      embeds: [{ title: '🗑️ Queue Cleared', description: `Removed **${count}** sign-up(s) from the **${event.type.toUpperCase()}** event queue.`, color: 0xED4245, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }]
    });
  }

  // ── /eventping ────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventping') {
    if (!event) return interaction.reply({ content: '❌ There is no active event to ping about.', ephemeral: true });
    const role = interaction.options.getRole('role');
    const extra = parseMultiline(interaction.options.getString('message') || '');
    const icons = { pvp: '⚔️', recording: '🎥', building: '🏗️' };
    const icon = icons[event.type] || '🎉';
    await interaction.reply({
      content: `${role} ${icon} **${event.type.toUpperCase()} Event** is happening at **${event.time}**!${extra ? `\n${extra}` : ''}`,
      allowedMentions: { roles: [role.id] }
    });
  }

  // ── /eventrules ───────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventrules') {
    const rules = parseMultiline(interaction.options.getString('rules'));
    const eventLabel = event ? `${event.type.toUpperCase()} Event` : 'Event';
    await interaction.reply({
      embeds: [{ title: `📜 Rules — ${eventLabel}`, description: rules, color: 0x5865F2, footer: { text: 'DisBit Event System • Please follow all rules' }, timestamp: new Date().toISOString() }]
    });
  }

  // ── /eventwinner ──────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventwinner') {
    const w1 = interaction.options.getUser('winner1');
    const w2 = interaction.options.getUser('winner2');
    const w3 = interaction.options.getUser('winner3');
    const prize = interaction.options.getString('prize');
    const winners = [w1, w2, w3].filter(Boolean);
    const medals = ['🥇', '🥈', '🥉'];
    const winnerLines = winners.map((w, i) => `${medals[i]} <@${w.id}>`).join('\n');
    const eventLabel = event ? `${event.type.toUpperCase()} Event` : 'Event';
    await interaction.reply({
      embeds: [{ title: `🏆 Winner${winners.length > 1 ? 's' : ''} Announced!`, description: `Congratulations to the winner${winners.length > 1 ? 's' : ''} of the **${eventLabel}**!\n\n${winnerLines}${prize ? `\n\n🎁 **Prize:** ${prize}` : ''}`, color: 0xF1C40F, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }]
    });
  }

  // ── /eventcountdown ───────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventcountdown') {
    const time = interaction.options.getString('time');
    const description = interaction.options.getString('description');
    await interaction.reply({
      embeds: [{ title: '⏳ Event Starting Soon!', description: `**${description}** is starting in **${time}**!\nGet ready and make sure you're signed up!`, color: 0xEB459E, fields: [{ name: '⏰ Starts In', value: time, inline: true }, { name: '📋 Event', value: description, inline: true }], footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }]
    });
  }

  // ── /eventinfo ────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventinfo') {
    if (!event) return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });
    const icons = { pvp: '⚔️', recording: '🎥', building: '🏗️' };
    const icon = icons[event.type] || '🎉';
    const queueStatus = event.queue === 'open' ? '🟢 Open' : '🔴 Closed';
    const fields = [
      { name: '📋 Type', value: event.type.toUpperCase(), inline: true },
      { name: '🚪 Queue', value: queueStatus, inline: true },
      { name: '⏰ Time', value: event.time, inline: true },
      { name: '👤 Host', value: `<@${event.host.id}>`, inline: true },
      { name: '👥 Sign-ups', value: `${event.signups.length}`, inline: true }
    ];
    if (event.notes) fields.push({ name: '📝 Notes', value: event.notes });
    await interaction.reply({ embeds: [{ title: `${icon} Current Event Info`, color: 0x5865F2, fields, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }] });
  }

  // ── /eventstatus ──────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventstatus') {
    if (!event) return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });
    const newStatus = interaction.options.getString('status');
    event.queue = newStatus;
    const statusLabel = newStatus === 'open' ? '🟢 Open' : '🔴 Closed';
    const color = newStatus === 'open' ? 0x57F287 : 0xED4245;
    await interaction.reply({ embeds: [{ title: '🚪 Queue Status Updated', description: `The **${event.type.toUpperCase()}** event queue is now **${statusLabel}**.`, color, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }] });
  }

  // ── /removeuser ───────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'removeuser') {
    if (!event) return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });
    const target = interaction.options.getUser('user');
    const idx = event.signups.findIndex(u => u.id === target.id);
    if (idx === -1) return interaction.reply({ content: `❌ <@${target.id}> is not in the sign-up queue.`, ephemeral: true });
    event.signups.splice(idx, 1);
    await interaction.reply({ embeds: [{ title: '🚫 User Removed from Queue', description: `<@${target.id}> has been removed from the **${event.type.toUpperCase()}** event queue.`, color: 0xED4245, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }] });
  }

  // ── /pickwinner ───────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'pickwinner') {
    if (!event) return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });
    if (event.signups.length === 0) return interaction.reply({ content: '❌ Nobody is signed up for the event yet!', ephemeral: true });
    const count = Math.min(interaction.options.getInteger('count') ?? 1, event.signups.length);
    const shuffled = [...event.signups].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, count);
    const medals = ['🥇', '🥈', '🥉'];
    const winnerLines = winners.map((w, i) => `${medals[i] ?? '🏅'} <@${w.id}>`).join('\n');
    await interaction.reply({ embeds: [{ title: '🎲 Random Winner Picked!', description: `From **${event.signups.length}** sign-ups, the winner${count > 1 ? 's are' : ' is'}:\n\n${winnerLines}`, color: 0xF1C40F, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }] });
  }

  // ── /eventnotes ───────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventnotes') {
    if (!event) return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });
    const notes = interaction.options.getString('notes');
    if (notes === null) {
      // View current notes
      await interaction.reply({
        embeds: [{ title: '📝 Event Notes', description: event.notes || '_No notes set._', color: 0x5865F2, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }]
      });
    } else {
      event.notes = parseMultiline(notes);
      await interaction.reply({ embeds: [{ title: '📝 Event Notes Updated', description: event.notes, color: 0x57F287, footer: { text: 'DisBit Event System' }, timestamp: new Date().toISOString() }] });
    }
  }

  // ── /poll ─────────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'poll') {
    const question = interaction.options.getString('question');
    const optionLabels = [
      interaction.options.getString('option1'),
      interaction.options.getString('option2'),
      interaction.options.getString('option3'),
      interaction.options.getString('option4')
    ].filter(Boolean);

    const pollData = {
      question,
      options: optionLabels.map(label => ({ label, votes: new Set() })),
      active: true
    };
    activePolls[guildId] = pollData;

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
    const optionLines = optionLabels.map((label, i) => `${numberEmojis[i]} **${label}**`).join('\n');

    await interaction.reply({
      embeds: [{
        title: '📊 Poll',
        description: `**${question}**\n\nVote using \`/vote\` with the option number:\n\n${optionLines}`,
        color: 0x5865F2,
        footer: { text: 'DisBit Poll System • Use /vote <1-4> to vote' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /pollresults ──────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'pollresults') {
    const poll = activePolls[guildId];
    if (!poll) return interaction.reply({ content: '❌ There is no active poll right now.', ephemeral: true });

    const total = poll.options.reduce((sum, o) => sum + o.votes.size, 0);
    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
    const resultLines = poll.options.map((o, i) => {
      const pct = total > 0 ? Math.round((o.votes.size / total) * 100) : 0;
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      return `${numberEmojis[i]} **${o.label}**\n\`${bar}\` ${pct}% (${o.votes.size} vote${o.votes.size !== 1 ? 's' : ''})`;
    }).join('\n\n');

    await interaction.reply({
      embeds: [{
        title: '📊 Poll Results',
        description: `**${poll.question}**\n\n${resultLines}\n\n_Total votes: ${total}_`,
        color: 0x5865F2,
        footer: { text: 'DisBit Poll System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /endpoll ──────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'endpoll') {
    const poll = activePolls[guildId];
    if (!poll) return interaction.reply({ content: '❌ There is no active poll right now.', ephemeral: true });

    const total = poll.options.reduce((sum, o) => sum + o.votes.size, 0);
    const sorted = [...poll.options].sort((a, b) => b.votes.size - a.votes.size);
    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
    const resultLines = poll.options.map((o, i) => {
      const pct = total > 0 ? Math.round((o.votes.size / total) * 100) : 0;
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      return `${numberEmojis[i]} **${o.label}**\n\`${bar}\` ${pct}% (${o.votes.size} vote${o.votes.size !== 1 ? 's' : ''})`;
    }).join('\n\n');

    delete activePolls[guildId];

    await interaction.reply({
      embeds: [{
        title: '📊 Poll Ended — Final Results',
        description: `**${poll.question}**\n\n${resultLines}\n\n🏆 **Winner: ${sorted[0].label}** with ${sorted[0].votes.size} vote${sorted[0].votes.size !== 1 ? 's' : ''}!\n_Total votes: ${total}_`,
        color: 0xF1C40F,
        footer: { text: 'DisBit Poll System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /giveaway ─────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'giveaway') {
    const prize = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winnerCount = interaction.options.getInteger('winners') ?? 1;
    const ms = parseDuration(durationStr);

    if (ms <= 0)
      return interaction.reply({ content: '❌ Invalid duration. Use formats like `10m`, `1h`, `1d`.', ephemeral: true });

    const endsAt = Date.now() + ms;

    activeGiveaways[guildId] = {
      prize,
      endsAt,
      winnerCount,
      entries: new Set(),
      active: true,
      channelId: interaction.channelId
    };

    const msg = await interaction.reply({
      embeds: [{
        title: '🎉 GIVEAWAY!',
        description: `**Prize:** ${prize}\n\n Use \`/giveawayenter\` to enter!\n\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n**Winners:** ${winnerCount}`,
        color: 0xEB459E,
        footer: { text: `DisBit Giveaway System • ${winnerCount} winner${winnerCount > 1 ? 's' : ''}` },
        timestamp: new Date().toISOString()
      }],
      fetchReply: true
    });

    // Auto-end after duration
    setTimeout(async () => {
      const gw = activeGiveaways[guildId];
      if (!gw || !gw.active) return;
      gw.active = false;
      const entriesArr = [...gw.entries];
      const channel = await client.channels.fetch(gw.channelId).catch(() => null);
      if (!channel) return;

      if (entriesArr.length === 0) {
        return channel.send({ embeds: [{ title: '🎉 Giveaway Ended', description: `No one entered the giveaway for **${gw.prize}**. No winners!`, color: 0xED4245, footer: { text: 'DisBit Giveaway System' }, timestamp: new Date().toISOString() }] });
      }

      const shuffled = [...entriesArr].sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, Math.min(gw.winnerCount, shuffled.length));
      const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

      await channel.send({
        content: winnerMentions,
        embeds: [{
          title: '🎉 Giveaway Ended!',
          description: `Congratulations ${winnerMentions}!\nYou won **${gw.prize}**! 🏆\n\n_${entriesArr.length} total entries._`,
          color: 0xF1C40F,
          footer: { text: 'DisBit Giveaway System' },
          timestamp: new Date().toISOString()
        }]
      });

      delete activeGiveaways[guildId];
    }, ms);
  }

  // ── /giveawayenter ────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'giveawayenter') {
    const gw = activeGiveaways[guildId];
    if (!gw || !gw.active) return interaction.reply({ content: '❌ There is no active giveaway right now.', ephemeral: true });
    if (gw.entries.has(interaction.user.id)) return interaction.reply({ content: '❌ You have already entered this giveaway!', ephemeral: true });
    gw.entries.add(interaction.user.id);
    await interaction.reply({ content: `✅ <@${interaction.user.id}> you have entered the giveaway for **${gw.prize}**! Good luck! 🍀 (${gw.entries.size} total entries)`, ephemeral: true });
  }

  // ── /giveawayend ─────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'giveawayend') {
    const gw = activeGiveaways[guildId];
    if (!gw || !gw.active) return interaction.reply({ content: '❌ There is no active giveaway right now.', ephemeral: true });
    gw.active = false;
    const entriesArr = [...gw.entries];

    if (entriesArr.length === 0) {
      delete activeGiveaways[guildId];
      return interaction.reply({ embeds: [{ title: '🎉 Giveaway Ended', description: `No one entered the giveaway for **${gw.prize}**. No winners!`, color: 0xED4245, footer: { text: 'DisBit Giveaway System' }, timestamp: new Date().toISOString() }] });
    }

    const shuffled = [...entriesArr].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, Math.min(gw.winnerCount, shuffled.length));
    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

    delete activeGiveaways[guildId];

    await interaction.reply({
      content: winnerMentions,
      embeds: [{
        title: '🎉 Giveaway Ended Early!',
        description: `Congratulations ${winnerMentions}!\nYou won **${gw.prize}**! 🏆\n\n_${entriesArr.length} total entries._`,
        color: 0xF1C40F,
        footer: { text: 'DisBit Giveaway System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /say ──────────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'say') {
    const targetChannel = interaction.options.getChannel('channel');
    const text = parseMultiline(interaction.options.getString('text'));
    if (!targetChannel.isTextBased()) return interaction.reply({ content: '❌ That channel is not a text channel.', ephemeral: true });
    try {
      await targetChannel.send(text);
      await interaction.reply({ content: `✅ Message sent to ${targetChannel}!`, ephemeral: true });
    } catch {
      await interaction.reply({ content: '❌ I don\'t have permission to send messages in that channel.', ephemeral: true });
    }
  }

  // ── /embed ────────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'embed') {
    const targetChannel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = parseMultiline(interaction.options.getString('description'));
    const colorHex = interaction.options.getString('color');
    const footer = interaction.options.getString('footer');
    const image = interaction.options.getString('image');

    if (!targetChannel.isTextBased()) return interaction.reply({ content: '❌ That channel is not a text channel.', ephemeral: true });

    const embedData = {
      title,
      description,
      color: parseColor(colorHex),
      timestamp: new Date().toISOString()
    };
    if (footer) embedData.footer = { text: footer };
    if (image) embedData.image = { url: image };

    try {
      await targetChannel.send({ embeds: [embedData] });
      await interaction.reply({ content: `✅ Embed sent to ${targetChannel}!`, ephemeral: true });
    } catch {
      await interaction.reply({ content: '❌ I don\'t have permission to send messages in that channel.', ephemeral: true });
    }
  }

  // ── /dm ───────────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'dm') {
    const target = interaction.options.getUser('user');
    const message = parseMultiline(interaction.options.getString('message'));
    try {
      await target.send(message);
      await interaction.reply({ content: `✅ DM sent to ${target.tag}.`, ephemeral: true });
    } catch {
      await interaction.reply({ content: `❌ Could not DM <@${target.id}>. They may have DMs disabled.`, ephemeral: true });
    }
  }

  // ── /serverinfo ───────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'serverinfo') {
    const guild = interaction.guild;
    await guild.members.fetch();
    const totalMembers = guild.memberCount;
    const botCount = guild.members.cache.filter(m => m.user.bot).size;
    const humanCount = totalMembers - botCount;
    const channelCount = guild.channels.cache.size;
    const roleCount = guild.roles.cache.size;
    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    await interaction.reply({
      embeds: [{
        title: `🏠 ${guild.name}`,
        thumbnail: { url: guild.iconURL({ dynamic: true }) || '' },
        color: 0x5865F2,
        fields: [
          { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
          { name: '📅 Created', value: `<t:${createdAt}:D>`, inline: true },
          { name: '👥 Members', value: `${humanCount} humans · ${botCount} bots`, inline: true },
          { name: '💬 Channels', value: `${channelCount}`, inline: true },
          { name: '🎭 Roles', value: `${roleCount}`, inline: true },
          { name: '🆔 Server ID', value: guild.id, inline: true }
        ],
        footer: { text: 'DisBit Info System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /userinfo ─────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'userinfo') {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const createdAt = Math.floor(target.createdTimestamp / 1000);
    const joinedAt = member ? Math.floor(member.joinedTimestamp / 1000) : null;
    const roles = member ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).join(', ') || 'None' : 'N/A';

    await interaction.reply({
      embeds: [{
        title: `👤 ${target.tag}`,
        thumbnail: { url: target.displayAvatarURL({ dynamic: true }) },
        color: 0x5865F2,
        fields: [
          { name: '🆔 User ID', value: target.id, inline: true },
          { name: '🤖 Bot?', value: target.bot ? 'Yes' : 'No', inline: true },
          { name: '📅 Account Created', value: `<t:${createdAt}:D>`, inline: true },
          ...(joinedAt ? [{ name: '📥 Joined Server', value: `<t:${joinedAt}:D>`, inline: true }] : []),
          { name: '🎭 Roles', value: roles }
        ],
        footer: { text: 'DisBit Info System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /reminder ─────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'reminder') {
    const timeStr = interaction.options.getString('time');
    const message = parseMultiline(interaction.options.getString('message'));
    const ms = parseDuration(timeStr);

    if (ms <= 0) return interaction.reply({ content: '❌ Invalid time format. Use e.g. `10m`, `1h`, `2h30m`.', ephemeral: true });

    const fireAt = Math.floor((Date.now() + ms) / 1000);
    const channelId = interaction.channelId;

    await interaction.reply({
      embeds: [{
        title: '⏰ Reminder Set!',
        description: `I'll remind you in this channel <t:${fireAt}:R>.\n\n**Message:** ${message}`,
        color: 0x57F287,
        footer: { text: 'DisBit Reminder System' },
        timestamp: new Date().toISOString()
      }]
    });

    setTimeout(async () => {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;
      await channel.send({
        content: `<@${interaction.user.id}>`,
        embeds: [{
          title: '⏰ Reminder!',
          description: message,
          color: 0xEB459E,
          footer: { text: 'DisBit Reminder System' },
          timestamp: new Date().toISOString()
        }]
      });
    }, ms);
  }

  // ── /coinflip ─────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'coinflip') {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    const emoji = result === 'Heads' ? '🪙' : '🥈';
    await interaction.reply({
      embeds: [{
        title: `${emoji} Coin Flip!`,
        description: `The coin landed on... **${result}**!`,
        color: result === 'Heads' ? 0xF1C40F : 0xBDC3C7,
        footer: { text: 'DisBit Fun System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /roll ─────────────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'roll') {
    const diceStr = interaction.options.getString('dice') ?? 'd6';
    const match = diceStr.match(/^(\d*)d(\d+)$/i);
    if (!match) return interaction.reply({ content: '❌ Invalid dice format. Use e.g. `d6`, `d20`, `2d6`.', ephemeral: true });

    const count = Math.min(parseInt(match[1] || '1'), 20);
    const sides = parseInt(match[2]);
    if (sides < 2 || sides > 1000) return interaction.reply({ content: '❌ Dice must have between 2 and 1000 sides.', ephemeral: true });

    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);
    const rollStr = rolls.map(r => `\`${r}\``).join(' + ');

    await interaction.reply({
      embeds: [{
        title: `🎲 Dice Roll — ${count}d${sides}`,
        description: count > 1
          ? `Rolls: ${rollStr}\n**Total: ${total}**`
          : `Rolled a **${total}**`,
        color: 0xEB459E,
        footer: { text: 'DisBit Fun System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /8ball ────────────────────────────────────────────────────────────────────
  else if (interaction.commandName === '8ball') {
    const question = interaction.options.getString('question');
    const responses = [
      // Positive
      '🟢 It is certain.', '🟢 It is decidedly so.', '🟢 Without a doubt.',
      '🟢 Yes, definitely.', '🟢 You may rely on it.', '🟢 As I see it, yes.',
      '🟢 Most likely.', '🟢 Outlook good.', '🟢 Yes.', '🟢 Signs point to yes.',
      // Neutral
      '🟡 Reply hazy, try again.', '🟡 Ask again later.',
      '🟡 Better not tell you now.', '🟡 Cannot predict now.', '🟡 Concentrate and ask again.',
      // Negative
      '🔴 Don\'t count on it.', '🔴 My reply is no.', '🔴 My sources say no.',
      '🔴 Outlook not so good.', '🔴 Very doubtful.'
    ];
    const answer = responses[Math.floor(Math.random() * responses.length)];
    const color = answer.startsWith('🟢') ? 0x57F287 : answer.startsWith('🟡') ? 0xFEE75C : 0xED4245;
    await interaction.reply({
      embeds: [{
        title: '🎱 Magic 8-Ball',
        fields: [
          { name: '❓ Question', value: question },
          { name: '💬 Answer', value: answer }
        ],
        color,
        footer: { text: 'DisBit Fun System' },
        timestamp: new Date().toISOString()
      }]
    });
  }
});

// ─── Handle /vote for polls (bonus prefix command for voting) ──────────────────
// Also add /giveawayenter as a slash command registration above ^
// (adding it here to the commands array wasn't done — add it manually or see below)

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ── !announce (updated to support \n) ─────────────────────────────────────────
  if (command === 'announce') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need the **Manage Messages** permission to use this command.');
    const targetChannel = message.mentions.channels.first();
    if (!targetChannel) return message.reply('❌ Please mention a channel. Usage: `!announce #channel Your text here`');
    const rawText = args.slice(1).join(' ');
    if (!rawText) return message.reply('❌ Please provide announcement text.');
    const text = parseMultiline(rawText);
    try {
      await targetChannel.send(text);
      await message.reply(`✅ Announcement sent to ${targetChannel}!`);
    } catch {
      message.reply('❌ I don\'t have permission to send messages in that channel.');
    }
  }

  // ── !hostevent ────────────────────────────────────────────────────────────────
  else if (command === 'hostevent') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need the **Manage Messages** permission.');
    const usage = '❌ Usage: `!hostevent <pvp|recording|building> <open|closed> <time>`';
    const eventType = args[0]?.toLowerCase();
    const queue = args[1]?.toLowerCase();
    const time = args.slice(2).join(' ');
    if (!eventType || !EVENT_TYPES.includes(eventType)) return message.reply(`❌ Invalid event type.\n${usage}`);
    if (!queue || !['open', 'closed'].includes(queue)) return message.reply(`❌ Queue must be \`open\` or \`closed\`.\n${usage}`);
    if (!time) return message.reply(`❌ Please provide a time.\n${usage}`);
    activeEvents[message.guildId] = { type: eventType, queue, time, host: message.author, signups: [], notes: '' };
    const embed = buildEventEmbed(eventType, queue, time, message.author);
    await message.channel.send(embed);
  }

  // ── !coinflip ─────────────────────────────────────────────────────────────────
  else if (command === 'coinflip') {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    message.reply(`🪙 The coin landed on **${result}**!`);
  }

  // ── !roll ─────────────────────────────────────────────────────────────────────
  else if (command === 'roll') {
    const diceStr = args[0] ?? 'd6';
    const match = diceStr.match(/^(\d*)d(\d+)$/i);
    if (!match) return message.reply('❌ Invalid format. Use e.g. `!roll d6`, `!roll 2d20`.');
    const count = Math.min(parseInt(match[1] || '1'), 20);
    const sides = parseInt(match[2]);
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);
    message.reply(count > 1 ? `🎲 Rolled ${count}d${sides}: ${rolls.join(', ')} = **${total}**` : `🎲 Rolled a **${total}** on a d${sides}!`);
  }
});

// ─── Register /giveawayenter and /vote as slash commands ─────────────────────
// These are handled in interactionCreate but need to be in the commands array.
// Add these to your `commands` array above, or uncomment and register separately:
//
// new SlashCommandBuilder().setName('giveawayenter').setDescription('Enter the current giveaway')
// new SlashCommandBuilder().setName('vote').setDescription('Vote in the current poll').addIntegerOption(...)

client.login(TOKEN);
