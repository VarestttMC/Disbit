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

// ─── Command Framework ────────────────────────────────────────────────────────

const commands = [
  // ── PRODUCTION ──
  new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule a recording or lore event')
    .addStringOption(o => o.setName('type').setDescription('Recording, Lore, or Building').setRequired(true))
    .addStringOption(o => o.setName('time').setDescription('When? (e.g. 5PM EST)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  new SlashCommandBuilder()
    .setName('callsheet')
    .setDescription('View the list of actors and crew for the current scene'),

  new SlashCommandBuilder()
    .setName('signon')
    .setDescription('Confirm your attendance for today\'s shoot'),

  // ── COMMUNICATION ──
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

  // ── STAFF TOOLS (Fixed the crash here) ──
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Purge messages from a channel')
    .addIntegerOption(o => 
        o.setName('amount')
         .setDescription('Number of messages (1-100)')
         .setRequired(true)
         .setMinValue(1)  // Correct method for Integers
         .setMaxValue(100) // Correct method for Integers
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // ── UTILITY & FUN ──
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('roll').setDescription('Roll for a random outcome in a scene'),
  new SlashCommandBuilder().setName('coinflip').setDescription('Heads or Tails?'),
  new SlashCommandBuilder().setName('8ball').setDescription('Ask the production gods a question')
    .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),

].map(cmd => cmd.toJSON());

// ─── Interaction Handler ──────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guildId, user } = interaction;

  // --- /ANNOUNCE ---
  if (commandName === 'announce') {
    const channel = options.getChannel('channel');
    const content = options.getString('content').replace(/\\n/g, '\n');
    const title = options.getString('title') || '📢 Production Update';

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(content)
      .setColor(0x5865F2)
      .setFooter({ text: `Orbit SMP • Admin: ${user.tag}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    return interaction.reply({ content: '✅ Announcement sent.', ephemeral: true });
  }

  // --- /DM ---
  if (commandName === 'dm') {
    const target = options.getUser('user');
    const msg = options.getString('message').replace(/\\n/g, '\n');

    try {
      await target.send({
        content: `**[Orbit SMP Production Message]**\nFrom: <@${user.id}>\n\n${msg}`
      });
      return interaction.reply({ content: `✅ DM sent to ${target.tag}.`, ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `❌ Could not DM ${target.tag}.`, ephemeral: true });
    }
  }

  // --- /CLEAR ---
  if (commandName === 'clear') {
    const amount = options.getInteger('amount');
    await interaction.channel.bulkDelete(amount, true);
    return interaction.reply({ content: `Successfully cleared ${amount} messages.`, ephemeral: true });
  }

  // --- /SCHEDULE ---
  if (commandName === 'schedule') {
    const type = options.getString('type');
    const time = options.getString('time');
    activeEvents[guildId] = { type, time, host: user, signups: [] };

    return interaction.reply({ 
        embeds: [new EmbedBuilder()
            .setTitle('🎬 Event Scheduled')
            .setDescription(`**${type}** is set for **${time}**.\nUse \`/signon\` to join the call sheet.`)
            .setColor(0xFEE75C)] 
    });
  }

  // --- /SIGNON ---
  if (commandName === 'signon') {
    const event = activeEvents[guildId];
    if (!event) return interaction.reply({ content: 'No active production scheduled.', ephemeral: true });
    
    if (!event.signups.includes(user.id)) {
      event.signups.push(user.id);
      return interaction.reply({ content: '✅ Added to the call sheet.' });
    }
    return interaction.reply({ content: 'You are already signed up.', ephemeral: true });
  }

  // --- /PING ---
  if (commandName === 'ping') {
    return interaction.reply(`🏓 Latency is ${client.ws.ping}ms`);
  }
});

// ─── Registration ──────────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`✅ Orbit Master Bot Online: ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Production commands registered successfully.');
  } catch (error) {
    console.error(error);
  }
});

client.login(TOKEN);
