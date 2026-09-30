const { isBlacklisted, isGuildAllowed, isChannelAllowed } = require('../utils/permissions');

const PREFIX = '.';

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Ignore bots and DMs (prefix commands only work in guilds)
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;

    const userId = message.author.id;

    // Blacklist check
    if (isBlacklisted(userId)) return;

    // Guild whitelist check
    if (!isGuildAllowed(message.guild.id)) return;

    // Channel restriction check
    if (!isChannelAllowed(message.guild.id, message.channel.id)) return;

    // Parse prefix command
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();

    // Map prefix commands to slash command names
    const prefixToSlash = {
      link: 'link',
      unlink: 'unlink',
      tokencheck: 'tokencheck',
      quest: 'quest',
      questall: 'questall',
      questlist: 'questlist',
      autoquest: 'autoquest',
      ping: 'ping',
      help: 'help',
      setchannel: 'setchannel',
      userblacklist: 'userblacklist',
      whitelistserver: 'whitelistserver',
      servers: 'servers',
      ownerhelp: 'ownerhelp',
    };

    const slashName = prefixToSlash[commandName];
    if (!slashName) return;

    const command = client.commands.get(slashName);
    if (!command) return;

    // Simulate a minimal interaction-like object for prefix commands
    const pseudoInteraction = createPseudoInteraction(message, args);

    try {
      await command.execute(pseudoInteraction, client);
    } catch (error) {
      console.error(`[Prefix] Error executing .${commandName}:`, error);
      message.reply('\u274C An error occurred while executing this command.');
    }
  },
};

/**
 * Create a pseudo-interaction from a message so commands work for both prefix and slash.
 */
function createPseudoInteraction(message, args) {
  return {
    isChatInputCommand: () => true,
    user: message.author,
    member: message.member,
    guild: message.guild,
    channel: message.channel,
    memberPermissions: message.member?.permissions,
    replied: false,
    deferred: false,

    reply(options) {
      if (this.replied || this.deferred) {
        return message.reply(typeof options === 'string' ? options : options.content || '');
      }
      this.replied = true;
      return message.reply(typeof options === 'string' ? options : options.content || '');
    },

    deferReply() {
      this.deferred = true;
      return Promise.resolve();
    },

    editReply(options) {
      const content = typeof options === 'string' ? options : (options.content || options.embeds ? '' : '');
      if (options.embeds) {
        return message.reply({ embeds: options.embeds });
      }
      return message.reply(content);
    },

    followUp(options) {
      const content = typeof options === 'string' ? options : (options.content || '');
      return message.reply(content);
    },

    options: {
      getString: (name) => {
 const idx = ['user', 'id', 'reason', 'action', 'quest_id', 'code'].indexOf(name);
        return idx >= 0 ? args[idx] : null;
      },
      getUser: (name) => {
        if (name === 'user' && args[0]) {
          const match = args[0].match(/^(\d+)$/);
          if (match) return message.client.users.cache.get(match[1]);
          return message.mentions.users.first() || null;
        }
        return null;
      },
      getSubcommand: () => null,
    },

    // StringSelectMenu builder mock for quest command
    awaitComponentInteraction: null,
  };
}