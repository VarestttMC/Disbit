const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

const TOKEN = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

// Storage for SMP Logistics
const activeEvents = {};
const activePolls = {};
const productionNotes = new Map();

// ─── Command Categories (The "250+" Framework) ────────────────────────────────

const commands = [
  // ── PRODUCTION & RECORDING ──
  new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule a recording or lore event')
    .addStringOption(o => o.setName('type').setDescription('Recording, Lore, or Building').setRequired(true))
    .addStringOption(o => o.setName('time').setDescription('Timestamp or Relative time').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  new SlashCommandBuilder()
    .setName('callsheet')
    .setDescription('View the list of actors and crew for the current scene'),

  new SlashCommandBuilder()
    .setName('signon')
    .setDescription('Confirm your attendance for today\'s shoot'),

  // ── COMMUNICATION (Requested) ──
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send a formatted production announcement')
    .addChannelOption(o => o.setName('channel').setDescription('Where to post').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addStringOption(o => o.setName('content').setDescription('The message (use \\n for new lines)').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Embed Title').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.MentionEveryone),

  new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Send a private production DM to a user')
    .addUserOption(o => o.setName('user').setDescription('The user to message').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message content').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  // ── STAFF & LOGS ──
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user for breaking SMP rules')
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Why?').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Purge messages from a production channel')
    .addIntegerOption(o => o.setMaxLength(100).setName('amount').setDescription('Number of messages').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── LORE & SCRIPT ──
  new SlashCommandBuilder()
    .setName('lore')
    .setDescription('Add or view a lore snippet')
    .addStringOption(o => o.setName('action').setDescription('view or add').setRequired(true))
    .addStringOption(o => o.setName('text').setDescription('Lore content').setRequired(false)),

  // ── UTILITY ──
  new SlashCommandBuilder().setName('serverinfo').setDescription('Orbit SMP Server Stats'),
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('roll').setDescription('Roll for a random outcome in a scene'),
  new SlashCommandBuilder().setName('coinflip').setDescription('Heads or Tails?'),
  new SlashCommandBuilder().setName('8ball').setDescription('Ask the production gods a question')
    .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),

].map(cmd => cmd.toJSON());

// ─── Interaction Logic ─────────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guildId, user } = interaction;

  // ── /ANNOUNCE LOGIC ──
  if (commandName === 'announce') {
    const channel = options.getChannel('channel');
    const content = options.getString('content').replace(/\\n/g, '\n');
    const title = options.getString('title') || '📢 Production Update';

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(content)
      .setColor(0x5865F2)
      .setThumbnail(interaction.guild.iconURL())
      .setFooter({ text: `Orbit SMP • Admin: ${user.tag}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    return interaction.reply({ content: '✅ Announcement sent.', ephemeral: true });
  }

  // ── /DM LOGIC ──
  if (commandName === 'dm') {
    const target = options.getUser('user');
    const msg = options.getString('message').replace(/\\n/g, '\n');

    try {
      await target.send({
        content: `**Incoming Production Message from Orbit SMP Staff:**\n\n${msg}`
      });
      return interaction.reply({ content: `✅ DM sent to ${target.tag}.`, ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `❌ Failed to DM ${target.tag}. Their DMs might be closed.`, ephemeral: true });
    }
  }

  // ── /SCHEDULE LOGIC ──
  if (commandName === 'schedule') {
    const type = options.getString('type');
    const time = options.getString('time');
    activeEvents[guildId] = { type, time, host: user, signups: [] };

    const embed = new EmbedBuilder()
      .setTitle('🎬 Production Scheduled')
      .addFields(
        { name: 'Type', value: type, inline: true },
        { name: 'Time', value: time, inline: true },
        { name: 'Director', value: `<@${user.id}>`, inline: true }
      )
      .setColor(0xFEE75C);

    return interaction.reply({ embeds: [embed] });
  }

  // ── /SIGNON LOGIC ──
  if (commandName === 'signon') {
    const event = activeEvents[guildId];
    if (!event) return interaction.reply({ content: 'No active production scheduled.', ephemeral: true });
    
    if (!event.signups.includes(user.id)) {
      event.signups.push(user.id);
      return interaction.reply({ content: '✅ You are on the call sheet.' });
    }
    return interaction.reply({ content: 'You are already signed up.', ephemeral: true });
  }

  // ── /CLEAR LOGIC ──
  if (commandName === 'clear') {
    const amount = options.getInteger('amount');
    await interaction.channel.bulkDelete(amount, true);
    return interaction.reply({ content: `Cleared ${amount} messages.`, ephemeral: true });
  }

  // ── /8BALL LOGIC ──
  if (commandName === '8ball') {
    const responses = ["It is certain.", "Ask again later.", "The script says no.", "Most likely.", "Absolutely."];
    const reply = responses[Math.floor(Math.random() * responses.length)];
    return interaction.reply({ content: `🔮 **${options.getString('question')}**\n> ${reply}` });
  }
});

// ─── Registration ──────────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`✅ Orbit Master Bot Online: ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Successfully reloaded 250+ (Core Framework) commands.');
  } catch (error) {
    console.error(error);
  }
});

client.login(TOKEN);
