const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, EMOJIS, fieldDivider, progressBar } = require('../utils/embeds');
const { stmts } = require('../database/db');
const { fetchQuests, completeAllQuests, getQuestName, getGameTitle, getAppName } = require('../utils/questAPI');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('questall')
    .setDescription('Complete all supported available quests at once.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const user = stmts.getUser.get(userId);

    if (!user || !user.user_token) {
      return interaction.reply({
        embeds: [errorEmbed(
          'Account Not Linked',
          'You must link your Discord account first before using quest commands.\n\n' +
          EMOJIS.arrow + ' Use `/link` with your user token to get started.'
        )],
      });
    }

    await interaction.deferReply();
    const logPrefix = '[QuestAll] User ' + userId.slice(0, 8);

    await interaction.editReply({
      embeds: [infoEmbed(
        'Processing All Quests',
        EMOJIS.loading + ' Fetching and processing all your available quests...\n\n' +
        EMOJIS.dot + ' This may take several minutes depending on quest types.\n' +
        EMOJIS.dot + ' Video quests require watching time simulation.\n' +
        EMOJIS.dot + ' Play/Stream quests require heartbeat intervals.\n\n' +
        EMOJIS.info + ' _Please be patient \u2014 the bot will update when done._'
      )],
    });

    let response;
    try {
      response = await fetchQuests(user.user_token);
    } catch (e) {
      return interaction.editReply({
        embeds: [errorEmbed(
          'Fetch Failed',
          'Could not retrieve quests: `' + e.message + '`\n\n' +
          EMOJIS.arrow + ' Use `/tokencheck` to verify your connection.'
        )],
      });
    }

    const allQuests = (response && response.quests) || [];

    if (allQuests.length === 0) {
      return interaction.editReply({
        embeds: [infoEmbed(
          'No Quests',
          'There are no quests available on your account right now.\n\n' +
          EMOJIS.arrow + ' Check back later or enable `/autoquest`.'
        )],
      });
    }

    // Use completeAllQuests — handles gateway session, filtering, and processing
    const batch = await completeAllQuests(user.user_token, allQuests, [], logPrefix);

    const total = batch.totalValid + batch.totalUnclaimed;
    const completedCount = batch.succeeded + batch.claimed;

    const successes = batch.results.filter(r => r.success && !r.claimed && !r.claimError);
    const claims = batch.results.filter(r => r.claimed);
    const claimIssues = batch.results.filter(r => r.success && r.claimError);
    const failures = batch.results.filter(r => !r.success);

    const fields = [];

    if (successes.length > 0) {
      fields.push({
        name: EMOJIS.success + '  Completed (' + successes.length + ')',
        value: successes.slice(0, 8).map(r => EMOJIS.success + ' **' + r.questName + '**').join('\n') + (successes.length > 8 ? '\n_...and ' + (successes.length - 8) + ' more_' : ''),
        inline: false,
      });
    }

    if (claims.length > 0) {
      fields.push({
        name: EMOJIS.trophy + '  Claimed (' + claims.length + ')',
        value: claims.slice(0, 8).map(r => EMOJIS.trophy + ' **' + r.questName + '**').join('\n') + (claims.length > 8 ? '\n_...and ' + (claims.length - 8) + ' more_' : ''),
        inline: false,
      });
    }

    if (claimIssues.length > 0) {
      fields.push({
        name: EMOJIS.warning + '  Claim Issues (' + claimIssues.length + ')',
        value: claimIssues.slice(0, 5).map(r => EMOJIS.warning + ' **' + r.questName + '** \u2014 `' + r.claimError + '`').join('\n'),
        inline: false,
      });
    }

    if (failures.length > 0) {
      fields.push({
        name: EMOJIS.error + '  Failed (' + failures.length + ')',
        value: failures.slice(0, 5).map(r => EMOJIS.error + ' **' + (r.questName || 'Unknown') + '** \u2014 `' + (r.error || 'failed') + '`').join('\n') + (failures.length > 5 ? '\n_...and ' + (failures.length - 5) + ' more_' : ''),
        inline: false,
      });
    }

    const isPerfect = batch.failed === 0;
    const embed = (isPerfect ? successEmbed : (batch.succeeded === 0 ? errorEmbed : infoEmbed))(
      isPerfect ? 'All Quests Successful!' : 'Quest Batch Complete',
      (isPerfect ? EMOJIS.trophy + ' Perfect run! ' : EMOJIS.info + ' ') +
      'Processed **' + total + '** quest(s) \u2014 **' + completedCount + '/' + total + '** successful.' +
      (batch.failed > 0 ? '\n' + EMOJIS.dot + ' Some quests failed. They may be retried later.' : '')
    ).addFields(fields);

    return interaction.editReply({ embeds: [embed] });
  },
};
