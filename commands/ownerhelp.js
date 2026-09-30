const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, EMOJIS, PALETTE } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ownerhelp')
    .setDescription('View owner-only commands.'),

  ownerOnly: true,

  async execute(interaction) {
    const embed = createEmbed({
      title: EMOJIS.shield + '  Owner-Only Commands',
      description: 'These commands are restricted to the bot owner (' + (require('../config/config').ownerId || 'not set') + ').',
      color: PALETTE.yellow,
      fields: [
        { name: '/userblacklist add <user> [reason]', value: 'Add a user to the global blacklist.', inline: false },
        { name: '/userblacklist remove <user>', value: 'Remove a user from the blacklist.', inline: false },
        { name: '/userblacklist list', value: 'View all blacklisted users.', inline: false },
        { name: '/whitelistserver add <id>', value: 'Add a server to the whitelist.', inline: false },
        { name: '/whitelistserver remove <id>', value: 'Remove a server from the whitelist.', inline: false },
        { name: '/whitelistserver list', value: 'View all whitelisted servers.', inline: false },
        { name: '/whitelistserver clear', value: 'Clear the whitelist (allow all servers).', inline: false },
        { name: '/servers', value: 'View all servers the bot is in.', inline: false },
      ],
    });

    return interaction.reply({ embeds: [embed] });
  },
};
