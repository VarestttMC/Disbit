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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Production-focused Event Types
const EVENT_TYPES = ['recording', 'lore_meeting', 'set_building', 'rehearsal'];

const activeEvents = {};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseMultiline(str) {
  return str.replace(/\\n/g, '\n');
}

// ─── Embed Builders ────────────────────────────────────────────────────────────

function buildProductionEmbed(type, time, host, loreNotes) {
  const icons = { 
    recording: '🎥', 
    lore_meeting: '📜', 
    set_building: '🏗️', 
    rehearsal: '🎭' 
  };
  
  const titles = {
    recording: 'Recording Session',
    lore_meeting: 'Lore & Script Briefing',
    set_building: 'Set Construction',
    rehearsal: 'Scene Rehearsal'
  };

  const embed = new EmbedBuilder()
    .setTitle(`${icons[type] || '🎬'} Production Event: ${titles[type] || type}`)
    .setColor(0x5865F2)
    .addFields(
      { name: '📅 Scheduled Time', value: time, inline: true },
      { name: '🎬 Director/Host', value: `<@${host.id}>`, inline: true },
      { name: '📋 Status', value: '🟢 Required Personnel Only', inline: true }
    )
    .setFooter({ text: 'Orbit SMP Production Management' })
    .setTimestamp();

  if (loreNotes) {
    embed.addFields({ name: '📝 Script/Lore Notes', value: loreNotes });
  }

  return { embeds: [embed] };
}

// ─── Slash Command Definitions ─────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule a production event for the SMP')
    .addStringOption(o =>
      o.setName('type').setDescription('What kind of session?').setRequired(true)
        .addChoices(
          { name: '🎥 Recording Session', value: 'recording' },
          { name: '📜 Lore Meeting', value: 'lore_meeting' },
          { name: '🏗️ Set Building', value: 'set_building' },
          { name: '🎭 Scene Rehearsal', value: 'rehearsal' }
        )
    )
    .addStringOption(o => o.setName('time').setDescription('When? (e.g. Saturday 4PM EST)').setRequired(true))
    .addStringOption(o => o.setName('notes').setDescription('Script notes or scene objectives').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

  new SlashCommandBuilder()
    .setName('callsheet')
    .setDescription('View who is signed up for the current session'),

  new SlashCommandBuilder()
    .setName('signon')
    .setDescription('Confirm your attendance for the scheduled production'),

  new SlashCommandBuilder()
    .setName('endproduction')
    .setDescription('Clear the current production event')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),

].map(cmd => cmd.toJSON());

// ─── Interaction Handler ───────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;
  const event = activeEvents[guildId];

  if (interaction.commandName === 'schedule') {
    const type = interaction.options.getString('type');
    const time = interaction.options.getString('time');
    const notes = parseMultiline(interaction.options.getString('notes') || '');

    activeEvents[guildId] = { 
      type, 
      time, 
      host: interaction.user, 
      attendees: [], 
      notes 
    };

    return interaction.reply(buildProductionEmbed(type, time, interaction.user, notes));
  }

  if (interaction.commandName === 'signon') {
    if (!event) return interaction.reply({ content: '❌ No active production scheduled.', ephemeral: true });
    
    if (event.attendees.some(u => u.id === interaction.user.id)) {
      return interaction.reply({ content: 'You are already on the call sheet.', ephemeral: true });
    }

    event.attendees.push({ id: interaction.user.id, tag: interaction.user.tag });
    return interaction.reply({ 
      content: `✅ <@${interaction.user.id}> is confirmed for the **${event.type}** session.`, 
      ephemeral: false 
    });
  }

  if (interaction.commandName === 'callsheet') {
    if (!event) return interaction.reply({ content: '❌ No active production scheduled.', ephemeral: true });

    const list = event.attendees.length > 0 
      ? event.attendees.map((u, i) => `\`${i + 1}.\` <@${u.id}>`).join('\n')
      : '_No cast/crew signed on yet._';

    const embed = new EmbedBuilder()
      .setTitle(`Call Sheet: ${event.type.replace('_', ' ').toUpperCase()}`)
      .setDescription(`**Time:** ${event.time}\n\n**Personnel:**\n${list}`)
      .setColor(0xFEE75C)
      .setFooter({ text: 'Orbit SMP Production' });

    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'endproduction') {
    delete activeEvents[guildId];
    return interaction.reply('🎬 Production event cleared.');
  }
});

client.once('ready', async () => {
  console.log(`✅ Orbit Production Bot online: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (err) {
    console.error(err);
  }
});

client.login(TOKEN);
