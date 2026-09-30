const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, warningEmbed, EMOJIS } = require('../utils/embeds');
const { stmts } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoquest')
    .setDescription('Automatically complete newly available quests.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const user = stmts.getUser.get(userId);

    if (!user || !user.user_token) {
      return interaction.reply({
        embeds: [errorEmbed(
          'Account Not Linked',
          'You must link your account first. Use `/link` to connect.\n\n' +
          EMOJIS.arrow + ' Your token is stored securely and used only for quest operations.'
        )],
      });
    }

    const currentState = user.autoquest_enabled === 1;
    const newState = currentState ? 0 : 1;
    stmts.setAutoquest.run(newState, userId);

    const interval = require('../config/config').questCheckInterval / 60000;

    if (newState) {
      return interaction.reply({
        embeds: [successEmbed(
          'Auto-Quest Enabled',
          EMOJIS.success + ' Zuest will now automatically complete and claim your quests!\n\n' +
          EMOJIS.loading + ' **Check Interval:** Every `' + interval + '` minutes\n' +
          EMOJIS.quest + ' **Scope:** All supported quest types (Video, Play, Stream, Activity, Achievement)\n' +
          EMOJIS.trophy + ' **Rewards:** Auto-claimed when completed\n\n' +
          EMOJIS.info + ' _Use `/autoquest` again to disable._'
        )],
      });
    } else {
      return interaction.reply({
        embeds: [warningEmbed(
          'Auto-Quest Disabled',
          EMOJIS.warning + ' Automatic quest handling is now OFF.\n\n' +
          EMOJIS.dot + ' You can still use `/quest` and `/questall` manually.\n' +
          EMOJIS.arrow + ' Re-enable anytime with `/autoquest`.'
        )],
      });
    }
  },
};
