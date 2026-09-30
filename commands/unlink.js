const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, EMOJIS } = require('../utils/embeds');
const { stmts } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Remove your saved account connection.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const existing = stmts.getUser.get(userId);

    if (!existing) {
      return interaction.reply({
        embeds: [errorEmbed(
          'Not Linked',
          'You don\'t have a linked account to remove.\n\n' +
          EMOJIS.arrow + ' Use `/link` to connect your account first.'
        )],
      });
    }

    const oldName = existing.username || 'Unknown';
    stmts.removeUser.run(userId);

    return interaction.reply({
      embeds: [successEmbed(
        'Account Unlinked',
        EMOJIS.unlink + ' Successfully removed connection for **' + oldName + '**.\n\n' +
        EMOJIS.dot + ' All stored data has been deleted.\n' +
        EMOJIS.dot + ' Auto-Quest has been disabled.\n\n' +
        EMOJIS.arrow + ' Use `/link` anytime to reconnect.'
      )],
    });
  },
};
