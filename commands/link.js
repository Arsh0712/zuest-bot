const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, EMOJIS } = require('../utils/embeds');
const { stmts } = require('../database/db');
const { validateToken } = require('../utils/questAPI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account by providing your user token.')
    .addStringOption(opt =>
      opt.setName('token').setDescription('Your Discord user token.').setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const token = interaction.options.getString('token').trim();

    if (!token || token.length < 50) {
      return interaction.reply({
        embeds: [errorEmbed(
          'Invalid Token',
          'The token you provided is too short or empty.\n\n' +
          EMOJIS.dot + ' Discord user tokens are typically 80+ characters.\n' +
          EMOJIS.arrow + ' Make sure you copied the full token from DevTools.'
        )],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    await interaction.editReply({
      embeds: [infoEmbed(
        'Validating Token',
        EMOJIS.loading + ' Verifying your Discord token...\n\n' +
        EMOJIS.dot + ' Checking authentication...\n' +
        EMOJIS.dot + ' Retrieving account info...'
      )],
    });

    const result = await validateToken(token);

    if (!result.valid) {
      return interaction.editReply({
        embeds: [errorEmbed(
          'Token Invalid',
          'The provided token is invalid or expired.\n\n' +
          EMOJIS.dot + ' **Error:** `' + (result.error || 'Unknown') + '`\n' +
          EMOJIS.arrow + ' Generate a fresh token from Discord DevTools (Application > Storage > Cookies).\n' +
          EMOJIS.warning + ' _Never share your token with anyone._'
        )],
      });
    }

    stmts.upsertUser.run(userId, token, result.username || 'Unknown');

    return interaction.editReply({
      embeds: [successEmbed(
        'Account Linked Successfully',
        EMOJIS.link + ' **' + result.username + '** (' + result.id + ') is now linked!\n\n' +
        EMOJIS.success + ' **You can now use:**\n' +
        EMOJIS.arrow + ' `/questlist` — View all your quests with detailed statuses\n' +
        EMOJIS.arrow + ' `/quest` — Complete a single quest\n' +
        EMOJIS.arrow + ' `/questall` — Complete and claim all quests\n' +
        EMOJIS.arrow + ' `/autoquest` — Enable automatic quest handling\n\n' +
        EMOJIS.shield + ' Your token is stored securely and never shared.\n' +
        EMOJIS.info + ' _Use `/tokencheck` anytime to verify your connection._'
      )],
    });
  },
};
