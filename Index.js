const { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ORBIT_SYSTEM = `You are Orbit AI — the official AI assistant for a serious Minecraft Scripted SMP called Orbit SMP.

Your personality: Smart, slightly cinematic, community-focused, professional but not corporate. Like a cinematic story director mixed with an event coordinator.

Rules:
- Never expose private info
- Never generate NSFW or illegal content  
- Never pick favorites among players/factions
- Keep responses clean, organized, and dramatic
- Use emojis sparingly and appropriately
- Format responses for Discord (use **bold**, *italic*, and plain text)
- Never use markdown headers with # symbols — use **BOLD CAPS** instead
- Keep responses concise and impactful`;

// ─── SLASH COMMANDS DEFINITION ─────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Generate a full scripted SMP event')
    .addStringOption(opt =>
      opt.setName('topic').setDescription('Event topic (e.g. election, war, betrayal)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('lore')
    .setDescription('Generate lore for a player, city, or faction')
    .addStringOption(opt =>
      opt.setName('subject').setDescription('Who or what to generate lore for').setRequired(true)),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Generate a cinematic announcement')
    .addStringOption(opt =>
      opt.setName('topic').setDescription('What the announcement is about').setRequired(true))
    .addStringOption(opt =>
      opt.setName('type').setDescription('Announcement type').setRequired(false)
        .addChoices(
          { name: 'Event Alert', value: 'event' },
          { name: 'War Declaration', value: 'war' },
          { name: 'Orbit News', value: 'news' },
          { name: 'Emergency Alert', value: 'emergency' },
          { name: 'Election Notice', value: 'election' },
        )),

  new SlashCommandBuilder()
    .setName('betray')
    .setDescription('[Director] Suggest a betrayal arc')
    .addStringOption(opt =>
      opt.setName('context').setDescription('Describe the situation or factions involved').setRequired(true)),

  new SlashCommandBuilder()
    .setName('twist')
    .setDescription('[Director] Generate a plot twist')
    .addStringOption(opt =>
      opt.setName('context').setDescription('Current storyline or situation').setRequired(true)),

  new SlashCommandBuilder()
    .setName('war')
    .setDescription('[Director] Plan a war arc')
    .addStringOption(opt =>
      opt.setName('factions').setDescription('Factions involved and the cause').setRequired(true)),

  new SlashCommandBuilder()
    .setName('loredrop')
    .setDescription('[Director] Create a mysterious lore drop')
    .addStringOption(opt =>
      opt.setName('context').setDescription('What the lore drop hints at').setRequired(true)),

  new SlashCommandBuilder()
    .setName('npc')
    .setDescription('[Director] Write NPC or character dialogue')
    .addStringOption(opt =>
      opt.setName('character').setDescription('Character name and scene context').setRequired(true)),

  new SlashCommandBuilder()
    .setName('newspaper')
    .setDescription('[Director] Generate an in-world Orbit newspaper article')
    .addStringOption(opt =>
      opt.setName('topic').setDescription('Topic or recent event to cover').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('[MOD] Generate a formal warning message')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
      opt.setName('player').setDescription('Player to warn').setRequired(true))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('Reason for the warning').setRequired(true))
    .addStringOption(opt =>
      opt.setName('strike').setDescription('Strike number').setRequired(false)
        .addChoices(
          { name: 'Strike 1', value: '1' },
          { name: 'Strike 2', value: '2' },
          { name: 'Strike 3 (final)', value: '3' },
        )),

  new SlashCommandBuilder()
    .setName('incident')
    .setDescription('[MOD] Log an incident to the mod log')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption(opt =>
      opt.setName('players').setDescription('Players involved').setRequired(true))
    .addStringOption(opt =>
      opt.setName('description').setDescription('What happened').setRequired(true))
    .addStringOption(opt =>
      opt.setName('severity').setDescription('Severity level').setRequired(false)
        .addChoices(
          { name: 'Minor', value: 'minor' },
          { name: 'Moderate', value: 'moderate' },
          { name: 'Severe', value: 'severe' },
        )),

  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Generate a daily community challenge or debate'),

  new SlashCommandBuilder()
    .setName('wanted')
    .setDescription('[Director] Generate a wanted poster for a player or faction')
    .addStringOption(opt =>
      opt.setName('target').setDescription('Player or faction name').setRequired(true))
    .addStringOption(opt =>
      opt.setName('crime').setDescription('Their alleged crime').setRequired(true)),

  new SlashCommandBuilder()
    .setName('orbai')
    .setDescription('Ask Orbit AI anything about the SMP')
    .addStringOption(opt =>
      opt.setName('question').setDescription('Your question').setRequired(true)),
];

// ─── REGISTER COMMANDS ──────────────────────────────────────────────────────

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// ─── AI HELPER ──────────────────────────────────────────────────────────────

async function askOrbit(prompt, maxTokens = 900) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: ORBIT_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

function splitMessage(text, maxLen = 1900) {
  const chunks = [];
  while (text.length > 0) {
    chunks.push(text.slice(0, maxLen));
    text = text.slice(maxLen);
  }
  return chunks;
}

// ─── COMMAND HANDLERS ───────────────────────────────────────────────────────

async function handleEvent(interaction) {
  const topic = interaction.options.getString('topic');
  await interaction.deferReply();

  const prompt = `Generate a complete Orbit SMP scripted event for: "${topic}".

Format for Discord (no # headers, use **BOLD** for section titles):

🌍 **ORBIT SMP — [EVENT TITLE IN CAPS]**

[2-sentence cinematic intro. Dramatic.]

━━━━━━━━━━━━━━━━━━━━━━

⚔ **OBJECTIVE:**
[Clear objective]

🏴 **TEAMS / FACTIONS:**
[Factions or team structure]

📋 **RULES:**
[3-5 numbered rules]

🏆 **REWARDS:**
[Reward details]

📍 **LOGISTICS:**
[Time, location, how to join]

━━━━━━━━━━━━━━━━━━━━━━

🔀 **OPTIONAL TWIST:**
[One dramatic mid-event plot twist]`;

  const result = await askOrbit(prompt);
  await interaction.editReply(result);
}

async function handleLore(interaction) {
  const subject = interaction.options.getString('subject');
  await interaction.deferReply();

  const prompt = `Generate deep lore for the Orbit SMP subject: "${subject}".

Format for Discord (use **BOLD** for section titles):

📖 **LORE — ${subject.toUpperCase()}**

**ORIGIN:**
[2-3 sentences]

**SECRETS:**
[2-3 hidden facts]

**POLITICAL GOALS:**
[What they want]

**RIVALS:**
[Who opposes them and why]

**POSSIBLE BETRAYALS:**
[Betrayal arcs that could emerge]

**FUTURE ARCS:**
[2-3 possible story directions]

Make it feel like a scripted TV series bible.`;

  const result = await askOrbit(prompt);
  await interaction.editReply(result);
}

async function handleAnnounce(interaction) {
  const topic = interaction.options.getString('topic');
  const type = interaction.options.getString('type') || 'event';
  await interaction.deferReply();

  const typeLabels = { event: 'Event Alert', war: 'War Declaration', news: 'Orbit News', emergency: 'Emergency Alert', election: 'Election Notice' };

  const prompt = `Create a cinematic Orbit SMP Discord announcement.
Type: ${typeLabels[type]}
Topic: ${topic}

Style guide:
- Open with an emoji + **ORBIT SMP** header line
- 2-3 lines of dramatic cinematic context
- Use **bold** for key details
- End with a call-to-action or suspense line
- Max 12 lines total
- Ready to copy-paste into Discord`;

  const result = await askOrbit(prompt);
  await interaction.editReply(result);
}

async function handleBetray(interaction) {
  const context = interaction.options.getString('context');
  await interaction.deferReply();

  const prompt = `You are the Orbit SMP Story Director. Suggest a dramatic betrayal arc:

Situation: "${context}"

Include:
- **Who betrays whom** and their motivation
- **Stage 1 — The Setup:** How tension builds quietly
- **Stage 2 — The Cracks:** Early warning signs players could notice
- **Stage 3 — The Reveal:** How the betrayal comes to light
- **Hint Drop Ideas:** Subtle things to plant in chat before the reveal

Make it feel like prestige TV. Keep player freedom intact — these are suggestions, not mandates.`;

  const result = await askOrbit(prompt);
  await interaction.editReply(result);
}

async function handleTwist(interaction) {
  const context = interaction.options.getString('context');
  await interaction.deferReply();

  const prompt = `You are the Orbit SMP Story Director. Generate a major plot twist.

Current situation: "${context}"

Include:
- **The Twist:** What the reveal actually is
- **How It Changes Everything:** Impact on existing lore and alliances
- **Player Reaction Potential:** How different factions might react
- **Execution Plan:** How to drop it cinematically in Minecraft/Discord

Be bold. Make it something nobody sees coming.`;

  const result = await askOrbit(prompt);
  await interaction.editReply(result);
}

async function handleWar(interaction) {
  const factions = interaction.options.getString('factions');
  await interaction.deferReply();

  const prompt = `You are the Orbit SMP Story Director. Plan a full war arc.

Factions / Cause: "${factions}"

Format:

⚔ **WAR BRIEF — ORBIT SMP**

**CASUS BELLI:** [The official cause of war]

**STAGE 1 — TENSION:** [Pre-war political pressure and events]
**STAGE 2 — FIRST BLOOD:** [Opening skirmish details]
**STAGE 3 — ESCALATION:** [Full war breaks out]
**TURNING POINT:** [One dramatic event that shifts the balance]
**POSSIBLE ENDINGS:** [2-3 different ways this war could conclude]

**COLLATERAL STORY HOOKS:** [Side plots this war creates]`;

  const result = await askOrbit(prompt);
  await interaction.editReply(result);
}

async function handleLoreDrop(interaction) {
  const context = interaction.options.getString('context');
  await interaction.deferReply();

  const prompt = `You are the Orbit SMP Story Director. Create a mysterious lore drop.

What it hints at: "${context}"

Write this as an in-world discovery — a mysterious message, ancient artifact inscription, intercepted letter, or strange broadcast that players find. 

Include:
- The actual lore drop text (written in-world, ready to post in #global-lore)
- **Hidden Clues:** What sharp players might notice
- **What It Actually Means:** The true meaning behind it (for staff eyes only)`;

  const result = await askOrbit(prompt);
  await interaction.editReply(result);
}

async function handleNPC(interaction) {
  const character = interaction.options.getString('character');
  await interaction.deferReply();

  const prompt = `You are the Orbit SMP Story Director. Write immersive in-character dialogue.

Character / Scene: "${character}"

Write 4-6 lines of dialogue this character would say. Make it cinematic and dramatic. Include brief stage directions in *italics* where helpful. This should be ready to roleplay or read aloud during a live event.`;

  const result = await askOrbit(prompt);
  await interaction.editReply(result);
}

async function handleNewspaper(interaction) {
  const topic = interaction.options.getString('topic');
  await interaction.deferReply();

  const prompt = `You are the Orbit SMP Story Director. Write an in-world Orbit SMP newspaper article.

Topic: "${topic}"

Use this format:

📰 **THE ORBIT CHRONICLE**
*"All the news worth knowing — and some that isn't."*

**[DRAMATIC HEADLINE IN CAPS]**
*By [Fictional Journalist Name] | Orbit Chronicle Correspondent*

[3 paragraphs of biased, dramatic in-world journalism. Write as if you're a reporter inside the SMP world. Reference factions, politics, rumors. Use quotes from "unnamed sources".]

---
*The Orbit Chronicle is not responsible for wars started as a result of this publication.*`;

  const result = await askOrbit(prompt);
  await interaction.editReply(result);
}

async function handleWarn(interaction) {
  const player = interaction.options.getUser('player');
  const reason = interaction.options.getString('reason');
  const strike = interaction.options.getString('strike') || '1';
  await interaction.deferReply({ ephemeral: true });

  const prompt = `Write a formal, professional warning message for Discord moderation in the Orbit SMP.

Player: ${player.username}
Reason: ${reason}
Strike: ${strike}/3

Format:
⚠️ **OFFICIAL WARNING — ORBIT SMP**

**Player:** ${player.username}
**Violation:** ${reason}
**Strike:** ${strike}/3

[Professional 2-3 sentence explanation of the violation, why it breaks server rules, and what happens next]

[If strike 3: state that the next action will be a ban]

*— Orbit Moderation Team*

Keep it firm, fair, and professional. No personal attacks.`;

  const result = await askOrbit(prompt);
  await interaction.editReply({ content: `**Generated warning for ${player.username}:**\n\n${result}`, ephemeral: true });
}

async function handleIncident(interaction) {
  const players = interaction.options.getString('players');
  const description = interaction.options.getString('description');
  const severity = interaction.options.getString('severity') || 'minor';
  await interaction.deferReply({ ephemeral: true });

  const now = new Date().toUTCString();

  const prompt = `Write a formal incident log entry for Orbit SMP staff records.

Timestamp: ${now}
Players Involved: ${players}
Description: ${description}
Severity: ${severity}

Format as a structured mod log entry with:
- **INCIDENT REPORT** header
- Timestamp, players, severity
- Summary of what happened
- Action taken (leave as [PENDING] if unknown)
- Recommended follow-up steps
- Staff member field as [LOGGED BY: {mod name}]`;

  const result = await askOrbit(prompt);
  await interaction.editReply({ content: result, ephemeral: true });
}

async function handleChallenge(interaction) {
  await interaction.deferReply();

  const prompts = [
    'Generate a spicy debate question for the Orbit SMP Discord community. Something that will cause friendly faction arguments. Make it feel important.',
    'Create a community screenshot or video challenge for Orbit SMP players. Make it creative and achievable.',
    'Write a roleplay prompt or hypothetical scenario for Orbit SMP that sparks discussion. Keep it dramatic.',
    'Generate a faction rivalry poll question for Orbit SMP. Something that will get people talking.',
  ];

  const chosen = prompts[Math.floor(Math.random() * prompts.length)];
  const result = await askOrbit(chosen);
  await interaction.editReply(result);
}

async function handleWanted(interaction) {
  const target = interaction.options.getString('target');
  const crime = interaction.options.getString('crime');
  await interaction.deferReply();

  const prompt = `Generate a dramatic in-world "WANTED" poster for Orbit SMP to post in Discord.

Target: "${target}"
Alleged Crime: "${crime}"

Format:

🚨 **WANTED — DEAD OR ALIVE** 🚨

**${target.toUpperCase()}**

*"${crime}"*

**CRIMES:**
[List 3-4 specific dramatic crimes based on the alleged crime given]

**LAST SEEN:**
[Dramatic in-world location]

**REWARD:** [Dramatic in-world reward — items, land, political power]

**ISSUED BY:** [Fictional Orbit SMP authority]

*Any information leading to their capture will be rewarded. Any assistance rendered to this individual will be considered treason.*`;

  const result = await askOrbit(prompt);
  await interaction.editReply(result);
}

async function handleAsk(interaction) {
  const question = interaction.options.getString('question');
  await interaction.deferReply();

  const result = await askOrbit(`A member of Orbit SMP is asking: "${question}"\n\nAnswer helpfully as Orbit AI. Be informative, slightly cinematic, and community-focused.`);
  await interaction.editReply(result);
}

// ─── EVENT LISTENERS ────────────────────────────────────────────────────────

client.once(Events.ClientReady, async (c) => {
  console.log(`\n🌍 Orbit AI is online — logged in as ${c.user.tag}`);
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'event':      await handleEvent(interaction); break;
      case 'lore':       await handleLore(interaction); break;
      case 'announce':   await handleAnnounce(interaction); break;
      case 'betray':     await handleBetray(interaction); break;
      case 'twist':      await handleTwist(interaction); break;
      case 'war':        await handleWar(interaction); break;
      case 'loredrop':   await handleLoreDrop(interaction); break;
      case 'npc':        await handleNPC(interaction); break;
      case 'newspaper':  await handleNewspaper(interaction); break;
      case 'warn':       await handleWarn(interaction); break;
      case 'incident':   await handleIncident(interaction); break;
      case 'challenge':  await handleChallenge(interaction); break;
      case 'wanted':     await handleWanted(interaction); break;
      case 'orbai':      await handleAsk(interaction); break;
    }
  } catch (err) {
    console.error(`Error handling /${interaction.commandName}:`, err);
    const msg = { content: '⚠️ Orbit AI encountered an error. Try again shortly.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
