const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN = process.env.TOKEN;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

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
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .toJSON()
  ];

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

    // Check the bot can send messages in that channel
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
});

client.login(TOKEN);
