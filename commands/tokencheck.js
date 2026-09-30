const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, EMOJIS } = require('../utils/embeds');
const { stmts } = require('../database/db');
const { validateToken } = require('../utils/questAPI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tokencheck')
    .setDescription('Check the status of your account connection.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const user = stmts.getUser.get(userId);

    if (!user || !user.user_token) {
      return interaction.reply({
        embeds: [errorEmbed(
          'Not Linked',
          'No account connection found.\n\n' +
          EMOJIS.arrow + ' Use `/link` to connect your Discord account.'
        )],
      });
    }

    await interaction.deferReply();

    const result = await validateToken(user.user_token);
    const autoquest = user.autoquest_enabled === 1;
    const linkedDate = new Date(user.linked_at * 1000).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    if (result.valid) {
      return interaction.editReply({
        embeds: [successEmbed(
          'Connection Active',
          EMOJIS.success + ' Your account is linked and healthy!\n\n' +
          EMOJIS.bot + ' **Username:** `' + result.username + '`\n' +
          EMOJIS.shield + ' **User ID:** `' + result.id + '`\n' +
          EMOJIS.link + ' **Linked Since:** ' + linkedDate + '\n' +
          EMOJIS.loading + ' **Auto-Quest:** ' + (autoquest ? EMOJIS.success + ' Enabled' : EMOJIS.error + ' Disabled') + '\n' +
          EMOJIS.dot + ' **Token Status:** Valid and responding\n\n' +
          EMOJIS.info + ' _All quest commands are ready to use._'
        )],
      });
    } else {
      return interaction.editReply({
        embeds: [errorEmbed(
          'Token Invalid',
          EMOJIS.error + ' Your stored token is no longer valid.\n\n' +
          EMOJIS.bot + ' **Last Known:** ' + (user.username || 'Unknown') + '\n' +
          EMOJIS.link + ' **Linked Since:** ' + linkedDate + '\n' +
          EMOJIS.error + ' **Error:** `' + (result.error || 'Unknown') + '`\n\n' +
          EMOJIS.arrow + ' Use `/unlink` then `/link` with a fresh token to fix this.'
        )],
      });
    }
  },
};
