# 🌍 ORBIT SMP — AI Discord Bot

> *The system behind the story.*

A fully AI-powered Discord bot for Orbit SMP. Built with Discord.js and Claude AI.

---

## COMMANDS

### 🎪 Event & Story
| Command | Description |
|---|---|
| `/event <topic>` | Generate a full scripted SMP event |
| `/lore <subject>` | Generate lore for a player, city, or faction |
| `/announce <topic> [type]` | Create a cinematic announcement |
| `/challenge` | Generate a random community debate or challenge |

### 🎬 Story Director
| Command | Description |
|---|---|
| `/betray <context>` | Suggest a dramatic betrayal arc |
| `/twist <context>` | Generate a plot twist |
| `/war <factions>` | Plan a full multi-stage war arc |
| `/loredrop <context>` | Create a mysterious in-world lore drop |
| `/npc <character>` | Write NPC or character dialogue |
| `/newspaper <topic>` | Generate an in-world Orbit Chronicle article |
| `/wanted <target> <crime>` | Generate a wanted poster |

### 🛡 Moderation (Mod-only)
| Command | Description |
|---|---|
| `/warn <player> <reason> [strike]` | Generate a formal warning message |
| `/incident <players> <description> [severity]` | Log an incident to the mod log |

### 💬 General
| Command | Description |
|---|---|
| `/orbai <question>` | Ask Orbit AI anything |

---

## SETUP

### Step 1 — Create a Discord Application

1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it "Orbit AI"
3. Go to **Bot** tab → click **Add Bot**
4. Under **Privileged Gateway Intents**, enable:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
5. Copy your **Bot Token** (you'll need it in `.env`)
6. Copy your **Application ID / Client ID** from the General Information tab

### Step 2 — Invite the Bot to Your Server

Replace `YOUR_CLIENT_ID` in this URL and open it in your browser:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

> Permission `8` = Administrator. You can reduce this after testing.

### Step 3 — Get Your Keys

- **Guild ID:** Right-click your Discord server name → Copy Server ID (enable Developer Mode in Discord settings first)
- **Anthropic API Key:** https://console.anthropic.com

### Step 4 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_server_id
ANTHROPIC_API_KEY=your_anthropic_key
```

### Step 5 — Install & Run

```bash
npm install
npm start
```

You should see:
```
🌍 Orbit AI is online — logged in as Orbit AI#1234
✅ Slash commands registered.
```

---

## HOSTING

For 24/7 uptime, deploy to one of these:

| Platform | Cost | Notes |
|---|---|---|
| **Railway** | Free tier available | Easiest — connect GitHub repo |
| **Render** | Free tier available | Good free option |
| **DigitalOcean** | ~$4/mo | Most reliable |
| **VPS (any)** | Varies | Use `pm2` to keep bot alive |

### Using pm2 (recommended for VPS):
```bash
npm install -g pm2
pm2 start index.js --name orbit-bot
pm2 save
pm2 startup
```

---

## FILE STRUCTURE

```
orbit-bot/
├── index.js          ← Main bot file (all commands + AI logic)
├── package.json
├── .env.example      ← Copy to .env and fill in your keys
├── .env              ← Your actual secrets (never share this)
├── .gitignore
└── README.md
```

---

## NOTES

- Slash commands are registered to your specific guild (server) — they appear instantly.
- The bot uses Claude claude-sonnet-4-20250514 for all AI responses.
- Mod commands (`/warn`, `/incident`) are ephemeral — only the mod who ran them can see the output.
- All AI responses are formatted for Discord (bold, italics, no markdown `#` headers).
