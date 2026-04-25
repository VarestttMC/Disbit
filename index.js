const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

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

// Register slash commands on startup
client.once('ready', async () => {
  console.log(`✅ DisBit is online as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('announce')
      .setDescription('Send an announcement to a channel')
      .addChannelOption(option =>
        option.setName('channel')
          .setDescription('The channel to send the announcement to')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('text')
          .setDescription('The announcement text')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
      .setName('hostevent')
      .setDescription('Host a new event')
      .addStringOption(option =>
        option.setName('type')
          .setDescription('The type of event')
          .setRequired(true)
          .addChoices(
            { name: '⚔️ PvP', value: 'pvp' },
            { name: '🎥 Recording', value: 'recording' },
            { name: '🏗️ Building', value: 'building' }
          )
      )
      .addStringOption(option =>
        option.setName('queue')
          .setDescription('Is the queue open or closed?')
          .setRequired(true)
          .addChoices(
            { name: '🟢 Open', value: 'open' },
            { name: '🔴 Closed', value: 'closed' }
          )
      )
      .addStringOption(option =>
        option.setName('time')
          .setDescription('When is the event happening? (e.g. 5PM EST)')
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ Slash commands registered globally.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'announce') {
    const targetChannel = interaction.options.getChannel('channel');
    const text = interaction.options.getString('text');

    if (!targetChannel.isTextBased()) {
      return interaction.reply({ content: '❌ That channel is not a text channel.', ephemeral: true });
    }

    try {
      await targetChannel.send(text);
      await interaction.reply({ content: `✅ Announcement sent to ${targetChannel}!`, ephemeral: true });
    } catch (err) {
      console.error('Failed to send announcement:', err);
      await interaction.reply({ content: '❌ I don\'t have permission to send messages in that channel.', ephemeral: true });
    }
  }

  if (interaction.commandName === 'hostevent') {
    const eventType = interaction.options.getString('type');
    const queue = interaction.options.getString('queue');
    const time = interaction.options.getString('time');

    const embed = buildEventEmbed(eventType, queue, time, interaction.user);
    await interaction.reply(embed);
  }
});

// Handle prefix commands
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'announce') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ You need the **Manage Messages** permission to use this command.');
    }

    const targetChannel = message.mentions.channels.first();
    if (!targetChannel) {
      return message.reply('❌ Please mention a channel. Usage: `!announce #channel Your text here`');
    }

    const text = args.slice(1).join(' ');
    if (!text) {
      return message.reply('❌ Please provide announcement text. Usage: `!announce #channel Your text here`');
    }

    try {
      await targetChannel.send(text);
      await message.reply(`✅ Announcement sent to ${targetChannel}!`);
    } catch (err) {
      console.error('Failed to send announcement:', err);
      message.reply('❌ I don\'t have permission to send messages in that channel.');
    }
  }

  if (command === 'hostevent') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ You need the **Manage Messages** permission to use this command.');
    }

    const usage = '❌ Usage: `!hostevent <pvp|recording|building> <open|closed> <time>`\nExample: `!hostevent pvp open 5PM EST`';

    const eventType = args[0]?.toLowerCase();
    const queue = args[1]?.toLowerCase();
    const time = args.slice(2).join(' ');

    if (!eventType || !EVENT_TYPES.includes(eventType)) {
      return message.reply(`❌ Invalid event type. Choose from: \`pvp\`, \`recording\`, \`building\`.\n${usage}`);
    }

    if (!queue || !['open', 'closed'].includes(queue)) {
      return message.reply(`❌ Queue must be \`open\` or \`closed\`.\n${usage}`);
    }

    if (!time) {
      return message.reply(`❌ Please provide a time.\n${usage}`);
    }

    const embed = buildEventEmbed(eventType, queue, time, message.author);
    await message.channel.send(embed);
  }
});

client.login(TOKEN);
