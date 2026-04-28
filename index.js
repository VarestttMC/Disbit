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
    GatewayIntentBits.MessageContent
  ]
});

const EVENT_TYPES = ['pvp', 'recording', 'building'];

// In-memory event state (per guild)
// Structure: { [guildId]: { type, queue, time, host, open, signups: [] } }
const activeEvents = {};

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
  // Existing: /announce
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send an announcement to a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('Announcement text').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // Existing: /hostevent
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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // NEW: /endevent
  new SlashCommandBuilder()
    .setName('endevent')
    .setDescription('End the current active event and clear its queue')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // NEW: /joinevent
  new SlashCommandBuilder()
    .setName('joinevent')
    .setDescription('Sign up to join the current event'),

  // NEW: /leaveevent
  new SlashCommandBuilder()
    .setName('leaveevent')
    .setDescription('Remove yourself from the current event sign-up queue'),

  // NEW: /viewqueue
  new SlashCommandBuilder()
    .setName('viewqueue')
    .setDescription('View the current event sign-up queue'),

  // NEW: /clearqueue
  new SlashCommandBuilder()
    .setName('clearqueue')
    .setDescription('Clear all sign-ups from the current event queue')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // NEW: /eventping
  new SlashCommandBuilder()
    .setName('eventping')
    .setDescription('Ping a role to alert them about the current event')
    .addRoleOption(o => o.setName('role').setDescription('The role to ping').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Optional extra message').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // NEW: /eventrules
  new SlashCommandBuilder()
    .setName('eventrules')
    .setDescription('Post the rules for the current event')
    .addStringOption(o => o.setName('rules').setDescription('The rules text (use \\n for new lines)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // NEW: /eventwinner
  new SlashCommandBuilder()
    .setName('eventwinner')
    .setDescription('Announce the winner(s) of the current event')
    .addUserOption(o => o.setName('winner1').setDescription('First winner').setRequired(true))
    .addUserOption(o => o.setName('winner2').setDescription('Second winner (optional)').setRequired(false))
    .addUserOption(o => o.setName('winner3').setDescription('Third winner (optional)').setRequired(false))
    .addStringOption(o => o.setName('prize').setDescription('Prize description (optional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // NEW: /eventcountdown
  new SlashCommandBuilder()
    .setName('eventcountdown')
    .setDescription('Post a countdown message for an upcoming event')
    .addStringOption(o => o.setName('time').setDescription('When is the event? e.g. 30 minutes, 2 hours').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('What is the event?').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // NEW: /eventinfo
  new SlashCommandBuilder()
    .setName('eventinfo')
    .setDescription('Display details about the current active event'),

  // NEW: /eventstatus
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

  // NEW: /removeuser
  new SlashCommandBuilder()
    .setName('removeuser')
    .setDescription('Remove a specific user from the event sign-up queue')
    .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // NEW: /pickwinner
  new SlashCommandBuilder()
    .setName('pickwinner')
    .setDescription('Randomly pick a winner from the current event sign-up queue')
    .addIntegerOption(o => o.setName('count').setDescription('How many winners to pick (default: 1)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
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

// ─── Interaction Handler ───────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;
  const event = activeEvents[guildId];

  // ── /announce ──────────────────────────────────────────────────────────────
  if (interaction.commandName === 'announce') {
    const targetChannel = interaction.options.getChannel('channel');
    const text = interaction.options.getString('text');

    if (!targetChannel.isTextBased())
      return interaction.reply({ content: '❌ That channel is not a text channel.', ephemeral: true });

    try {
      await targetChannel.send(text);
      await interaction.reply({ content: `✅ Announcement sent to ${targetChannel}!`, ephemeral: true });
    } catch {
      await interaction.reply({ content: '❌ I don\'t have permission to send messages in that channel.', ephemeral: true });
    }
  }

  // ── /hostevent ─────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'hostevent') {
    const eventType = interaction.options.getString('type');
    const queue = interaction.options.getString('queue');
    const time = interaction.options.getString('time');

    activeEvents[guildId] = {
      type: eventType,
      queue,
      time,
      host: interaction.user,
      signups: []
    };

    const embed = buildEventEmbed(eventType, queue, time, interaction.user);
    await interaction.reply(embed);
  }

  // ── /endevent ──────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'endevent') {
    if (!event)
      return interaction.reply({ content: '❌ There is no active event to end.', ephemeral: true });

    delete activeEvents[guildId];

    await interaction.reply({
      embeds: [{
        title: '🛑 Event Ended',
        description: 'The current event has been ended and the queue has been cleared.',
        color: 0xED4245,
        footer: { text: 'DisBit Event System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /joinevent ─────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'joinevent') {
    if (!event)
      return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });

    if (event.queue !== 'open')
      return interaction.reply({ content: '❌ The queue for this event is currently **closed**.', ephemeral: true });

    const alreadyIn = event.signups.some(u => u.id === interaction.user.id);
    if (alreadyIn)
      return interaction.reply({ content: '❌ You are already signed up for this event!', ephemeral: true });

    event.signups.push({ id: interaction.user.id, tag: interaction.user.tag });

    await interaction.reply({
      embeds: [{
        title: '✅ Signed Up!',
        description: `<@${interaction.user.id}> has joined the **${event.type.toUpperCase()}** event queue.\nYou are **#${event.signups.length}** in line.`,
        color: 0x57F287,
        footer: { text: 'DisBit Event System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /leaveevent ───────────────────────────────────────────────────────────
  else if (interaction.commandName === 'leaveevent') {
    if (!event)
      return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });

    const idx = event.signups.findIndex(u => u.id === interaction.user.id);
    if (idx === -1)
      return interaction.reply({ content: '❌ You are not signed up for this event.', ephemeral: true });

    event.signups.splice(idx, 1);

    await interaction.reply({
      embeds: [{
        title: '👋 Left Queue',
        description: `<@${interaction.user.id}> has been removed from the **${event.type.toUpperCase()}** event queue.`,
        color: 0xFEE75C,
        footer: { text: 'DisBit Event System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /viewqueue ────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'viewqueue') {
    if (!event)
      return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });

    await interaction.reply({ embeds: [buildQueueEmbed(event, guildId)] });
  }

  // ── /clearqueue ───────────────────────────────────────────────────────────
  else if (interaction.commandName === 'clearqueue') {
    if (!event)
      return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });

    const count = event.signups.length;
    event.signups = [];

    await interaction.reply({
      embeds: [{
        title: '🗑️ Queue Cleared',
        description: `Removed **${count}** sign-up(s) from the **${event.type.toUpperCase()}** event queue.`,
        color: 0xED4245,
        footer: { text: 'DisBit Event System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /eventping ────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventping') {
    if (!event)
      return interaction.reply({ content: '❌ There is no active event to ping about.', ephemeral: true });

    const role = interaction.options.getRole('role');
    const extra = interaction.options.getString('message') || '';

    const icons = { pvp: '⚔️', recording: '🎥', building: '🏗️' };
    const icon = icons[event.type] || '🎉';

    await interaction.reply({
      content: `${role} ${icon} **${event.type.toUpperCase()} Event** is happening at **${event.time}**! ${extra}`,
      allowedMentions: { roles: [role.id] }
    });
  }

  // ── /eventrules ───────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventrules') {
    const rules = interaction.options.getString('rules').replace(/\\n/g, '\n');
    const eventLabel = event ? `${event.type.toUpperCase()} Event` : 'Event';

    await interaction.reply({
      embeds: [{
        title: `📜 Rules — ${eventLabel}`,
        description: rules,
        color: 0x5865F2,
        footer: { text: 'DisBit Event System • Please follow all rules' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /eventwinner ──────────────────────────────────────────────────────────
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
      embeds: [{
        title: `🏆 Winner${winners.length > 1 ? 's' : ''} Announced!`,
        description: `Congratulations to the winner${winners.length > 1 ? 's' : ''} of the **${eventLabel}**!\n\n${winnerLines}${prize ? `\n\n🎁 **Prize:** ${prize}` : ''}`,
        color: 0xF1C40F,
        footer: { text: 'DisBit Event System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /eventcountdown ───────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventcountdown') {
    const time = interaction.options.getString('time');
    const description = interaction.options.getString('description');

    await interaction.reply({
      embeds: [{
        title: '⏳ Event Starting Soon!',
        description: `**${description}** is starting in **${time}**!\nGet ready and make sure you're signed up!`,
        color: 0xEB459E,
        fields: [
          { name: '⏰ Starts In', value: time, inline: true },
          { name: '📋 Event', value: description, inline: true }
        ],
        footer: { text: 'DisBit Event System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /eventinfo ────────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventinfo') {
    if (!event)
      return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });

    const icons = { pvp: '⚔️', recording: '🎥', building: '🏗️' };
    const icon = icons[event.type] || '🎉';
    const queueStatus = event.queue === 'open' ? '🟢 Open' : '🔴 Closed';

    await interaction.reply({
      embeds: [{
        title: `${icon} Current Event Info`,
        color: 0x5865F2,
        fields: [
          { name: '📋 Type', value: event.type.toUpperCase(), inline: true },
          { name: '🚪 Queue', value: queueStatus, inline: true },
          { name: '⏰ Time', value: event.time, inline: true },
          { name: '👤 Host', value: `<@${event.host.id}>`, inline: true },
          { name: '👥 Sign-ups', value: `${event.signups.length}`, inline: true }
        ],
        footer: { text: 'DisBit Event System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /eventstatus ──────────────────────────────────────────────────────────
  else if (interaction.commandName === 'eventstatus') {
    if (!event)
      return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });

    const newStatus = interaction.options.getString('status');
    event.queue = newStatus;

    const statusLabel = newStatus === 'open' ? '🟢 Open' : '🔴 Closed';
    const color = newStatus === 'open' ? 0x57F287 : 0xED4245;

    await interaction.reply({
      embeds: [{
        title: `🚪 Queue Status Updated`,
        description: `The **${event.type.toUpperCase()}** event queue is now **${statusLabel}**.`,
        color,
        footer: { text: 'DisBit Event System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /removeuser ───────────────────────────────────────────────────────────
  else if (interaction.commandName === 'removeuser') {
    if (!event)
      return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });

    const target = interaction.options.getUser('user');
    const idx = event.signups.findIndex(u => u.id === target.id);

    if (idx === -1)
      return interaction.reply({ content: `❌ <@${target.id}> is not in the sign-up queue.`, ephemeral: true });

    event.signups.splice(idx, 1);

    await interaction.reply({
      embeds: [{
        title: '🚫 User Removed from Queue',
        description: `<@${target.id}> has been removed from the **${event.type.toUpperCase()}** event queue.`,
        color: 0xED4245,
        footer: { text: 'DisBit Event System' },
        timestamp: new Date().toISOString()
      }]
    });
  }

  // ── /pickwinner ───────────────────────────────────────────────────────────
  else if (interaction.commandName === 'pickwinner') {
    if (!event)
      return interaction.reply({ content: '❌ There is no active event right now.', ephemeral: true });

    if (event.signups.length === 0)
      return interaction.reply({ content: '❌ Nobody is signed up for the event yet!', ephemeral: true });

    const count = Math.min(
      interaction.options.getInteger('count') ?? 1,
      event.signups.length
    );

    const shuffled = [...event.signups].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, count);
    const medals = ['🥇', '🥈', '🥉'];
    const winnerLines = winners.map((w, i) => `${medals[i] ?? '🏅'} <@${w.id}>`).join('\n');

    await interaction.reply({
      embeds: [{
        title: '🎲 Random Winner Picked!',
        description: `From **${event.signups.length}** sign-ups, the winner${count > 1 ? 's are' : ' is'}:\n\n${winnerLines}`,
        color: 0xF1C40F,
        footer: { text: 'DisBit Event System' },
        timestamp: new Date().toISOString()
      }]
    });
  }
});

// ─── Prefix Commands (kept for backwards compat) ───────────────────────────────

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'announce') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need the **Manage Messages** permission to use this command.');

    const targetChannel = message.mentions.channels.first();
    if (!targetChannel)
      return message.reply('❌ Please mention a channel. Usage: `!announce #channel Your text here`');

    const text = args.slice(1).join(' ');
    if (!text)
      return message.reply('❌ Please provide announcement text. Usage: `!announce #channel Your text here`');

    try {
      await targetChannel.send(text);
      await message.reply(`✅ Announcement sent to ${targetChannel}!`);
    } catch {
      message.reply('❌ I don\'t have permission to send messages in that channel.');
    }
  }

  if (command === 'hostevent') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need the **Manage Messages** permission to use this command.');

    const usage = '❌ Usage: `!hostevent <pvp|recording|building> <open|closed> <time>`\nExample: `!hostevent pvp open 5PM EST`';
    const eventType = args[0]?.toLowerCase();
    const queue = args[1]?.toLowerCase();
    const time = args.slice(2).join(' ');

    if (!eventType || !EVENT_TYPES.includes(eventType))
      return message.reply(`❌ Invalid event type. Choose from: \`pvp\`, \`recording\`, \`building\`.\n${usage}`);

    if (!queue || !['open', 'closed'].includes(queue))
      return message.reply(`❌ Queue must be \`open\` or \`closed\`.\n${usage}`);

    if (!time)
      return message.reply(`❌ Please provide a time.\n${usage}`);

    activeEvents[message.guildId] = {
      type: eventType,
      queue,
      time,
      host: message.author,
      signups: []
    };

    const embed = buildEventEmbed(eventType, queue, time, message.author);
    await message.channel.send(embed);
  }
});

client.login(TOKEN);
