const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const config = require('./config/config');

// Validate config
if (!config.token) {
  console.error('FATAL: DISCORD_TOKEN is not set in .env file.');
  console.error('Copy .env.example to .env and fill in your bot token.');
  process.exit(1);
}

if (!config.ownerId) {
  console.warn('WARNING: OWNER_ID is not set. Owner-only commands will be unavailable.');
}

// ============================================================
// BOT CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

// ============================================================
// LOAD COMMANDS
// ============================================================

const commandsDir = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsDir, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`[Commands] Loaded: ${command.data.name}`);
  } else {
    console.warn(`[Commands] Skipped (invalid): ${file}`);
  }
}

// ============================================================
// LOAD EVENTS
// ============================================================

const eventsDir = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsDir, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`[Events] Loaded: ${event.name}`);
}

// ============================================================
// ERROR HANDLING
// ============================================================

process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
  // Don't exit — try to keep running
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Shutdown] Received SIGINT, shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Shutdown] Received SIGTERM, shutting down...');
  client.destroy();
  process.exit(0);
});

// ============================================================
// LOGIN
// ============================================================

client.login(config.token).catch(err => {
  console.error('FATAL: Failed to login:', err.message);
  process.exit(1);
});
