const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, ComponentType } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, EMOJIS, progressBar, statusBadge, createEmbed } = require('../utils/embeds');
const { stmts } = require('../database/db');
const { fetchQuests, filterValidQuests, getQuestName, getGameTitle, getAppName, isCompleted, isEnrolled, hasClaimed, getTaskInfo, claimReward, completeQuestFull, createGatewaySession, isExpired } = require('../utils/questAPI');

// Map quest IDs to quest data for the select handler (per-user, expires after 5 min)
const _questCache = new Map();

function cacheKey(userId) { return 'quest:' + userId; }

function setCache(userId, quests) {
  _questCache.set(cacheKey(userId), { quests, ts: Date.now() });
  // Auto-cleanup after 5 minutes
  setTimeout(function() { _questCache.delete(cacheKey(userId)); }, 5 * 60 * 1000);
}

function getCache(userId) {
  const entry = _questCache.get(cacheKey(userId));
  if (!entry) return null;
  // Refresh expiry on access
  entry.ts = Date.now();
  return entry.quests;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quest')
    .setDescription('View available quests and complete one.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const user = stmts.getUser.get(userId);

    if (!user || !user.user_token) {
      return interaction.reply({
        embeds: [errorEmbed(
          'Account Not Linked',
          'You must link your Discord account first before using quest commands.\n\n' +
          EMOJIS.arrow + ' Use `/link` with your user token to get started.\n' +
          EMOJIS.arrow + ' Your token is stored securely and encrypted.'
        )],
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    const logPrefix = '[Quest] User ' + userId.slice(0, 8);

    await interaction.editReply({
      embeds: [infoEmbed(
        'Fetching Quests',
        EMOJIS.loading + ' Retrieving your available quests from Discord...\n' +
        EMOJIS.dot + ' This may take a moment.'
      )],
    });

    let response;
    try {
      response = await fetchQuests(user.user_token);
    } catch (e) {
      return interaction.editReply({
        embeds: [errorEmbed(
          'Fetch Failed',
          'Could not retrieve quests from Discord.\n\n' +
          EMOJIS.dot + ' **Error:** `' + e.message + '`\n' +
          EMOJIS.dot + ' Your token may be invalid or expired.\n' +
          EMOJIS.arrow + ' Use `/tokencheck` to verify your connection.'
        )],
      });
    }

    const allQuests = (response && response.quests) || [];

    if (allQuests.length === 0) {
      return interaction.editReply({
        embeds: [infoEmbed(
          'No Quests Available',
          'There are currently no quests available on your account.\n\n' +
          EMOJIS.dot + ' Discord periodically releases new quests.\n' +
          EMOJIS.dot + ' Check back later or enable `/autoquest` for automatic completion.\n\n' +
          EMOJIS.info + ' _New quests typically appear during gaming events and promotions._'
        )],
      });
    }

    const validQuests = filterValidQuests(allQuests, []);
    const unclaimedQuests = allQuests.filter(q => isCompleted(q) && !hasClaimed(q) && !validQuests.find(v => v.id === q.id));

    // Build the select menu options (max 25)
    const typeEmojis = { VIDEO: EMOJIS.video, GAME: EMOJIS.game, STREAM: EMOJIS.stream, ACTIVITY: EMOJIS.activity, ACHIEVEMENT: EMOJIS.achievement };

    const options = [];

    // First: completable quests
    for (const q of validQuests) {
      if (options.length >= 24) break;
      const name = getQuestName(q);
      const info = getTaskInfo(q);
      const game = getGameTitle(q) || getAppName(q) || '';
      const typeIcon = typeEmojis[info.type] || EMOJIS.quest;
      const label = name.length > 80 ? name.slice(0, 77) + '...' : name;
      const desc = (typeIcon + ' ' + (info.type || 'Unknown') + (game ? ' | ' + game : '')).slice(0, 100);
      options.push({
        label: label,
        description: desc,
        value: 'complete:' + q.id,
        emoji: typeEmojis[info.type] || '\u2753',
      });
    }

    // Add unclaimed rewards option if any
    if (unclaimedQuests.length > 0 && options.length < 25) {
      options.push({
        label: EMOJIS.trophy + ' Claim All Unclaimed Rewards (' + unclaimedQuests.length + ')',
        description: 'Quests already completed but rewards not yet claimed',
        value: 'claim_all_unclaimed',
      });
    }

    if (options.length === 0) {
      return interaction.editReply({
        embeds: [infoEmbed(
          'No Supported Quests',
          'No completable quests found right now.\n\n' +
          EMOJIS.dot + ' All current quests may be completed, expired, or unsupported.\n' +
          EMOJIS.dot + ' **Supported types:** Video, Play on Desktop, Stream, Activity, Achievement\n' +
          EMOJIS.arrow + ' Use `/questlist` to see all quest statuses.'
        )],
      });
    }

    // Cache quests for the select handler
    setCache(userId, allQuests);

    // Build the select menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('quest_select_' + userId)
      .setPlaceholder('Choose a quest to complete...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Build the quest list embed
    const listFields = [];
    for (let i = 0; i < Math.min(validQuests.length, 10); i++) {
      const q = validQuests[i];
      const name = getQuestName(q);
      const info = getTaskInfo(q);
      const game = getGameTitle(q) || getAppName(q) || 'N/A';
      const typeIcon = typeEmojis[info.type] || EMOJIS.quest;
      const progress = info.target > 0
        ? progressBar(info.done, info.target)
        : statusBadge(isEnrolled(q) ? 'enrolled' : 'available');
      listFields.push({
        name: (i + 1) + '. ' + name,
        value: typeIcon + ' Type: `' + (info.type || 'Unknown') + '` | Game: ' + game + '\n' + EMOJIS.dot + ' Progress: ' + progress,
        inline: false,
      });
    }

    if (validQuests.length > 10) {
      listFields.push({
        name: '...and ' + (validQuests.length - 10) + ' more',
        value: 'Select from the dropdown below to see all available quests.',
        inline: false,
      });
    }

    if (unclaimedQuests.length > 0) {
      listFields.push({
        name: EMOJIS.trophy + ' Unclaimed Rewards',
        value: 'You have **' + unclaimedQuests.length + '** completed quest(s) with unclaimed rewards.',
        inline: false,
      });
    }

    await interaction.editReply({
      embeds: [createEmbed({
        title: EMOJIS.quest + '  Available Quests',
        description: 'You have **' + validQuests.length + '** completable quest(s). Select one from the dropdown below to complete it.',
        color: 'blurple',
        fields: listFields,
      })],
      components: [row],
    });
  },

  /**
   * Handle the select menu interaction — called from interactionCreate
   */
  async handleSelect(interaction) {
    const userId = interaction.user.id;
    const user = stmts.getUser.get(userId);

    if (!user || !user.user_token) {
      return interaction.reply({
        embeds: [errorEmbed('Account Not Linked', 'Your account is not linked.')],
        ephemeral: true,
      });
    }

    const selectedValue = interaction.values[0];
    const logPrefix = '[Quest] User ' + userId.slice(0, 8);

    // Handle "claim all unclaimed" option
    if (selectedValue === 'claim_all_unclaimed') {
      await interaction.deferUpdate();
      const allQuests = getCache(userId);
      if (!allQuests) {
        return interaction.editReply({
          embeds: [errorEmbed('Session Expired', 'Quest data expired. Please run `/quest` again.')],
          components: [],
        });
      }

      const unclaimed = allQuests.filter(q => isCompleted(q) && !hasClaimed(q));
      let claimed = 0;
      let failed = 0;
      const results = [];

      for (const q of unclaimed) {
        const name = getQuestName(q);
        try {
          await claimReward(user.user_token, q.id);
          claimed++;
          results.push(EMOJIS.success + ' ' + name);
        } catch (e) {
          failed++;
          results.push(EMOJIS.error + ' ' + name + ' — `' + e.message + '`');
        }
        await new Promise(function(r) { setTimeout(r, 1000); });
      }

      const desc = results.slice(0, 10).join('\n') +
        (results.length > 10 ? '\n...and ' + (results.length - 10) + ' more' : '');

      return interaction.editReply({
        embeds: [createEmbed({
          title: (claimed > 0 ? EMOJIS.success : EMOJIS.error) + '  Reward Claims',
          description: desc,
          color: failed === 0 ? 'green' : 'yellow',
          footer: { text: claimed + ' claimed' + (failed > 0 ? ', ' + failed + ' failed' : '') },
        })],
        components: [],
      });
    }

    // Handle single quest completion
    if (!selectedValue.startsWith('complete:')) return;

    const questId = selectedValue.replace('complete:', '');
    const allQuests = getCache(userId);
    if (!allQuests) {
      return interaction.reply({
        embeds: [errorEmbed('Session Expired', 'Quest data expired. Please run `/quest` again.')],
        ephemeral: true,
      });
    }

    const quest = allQuests.find(function(q) { return q.id === questId; });
    if (!quest) {
      return interaction.reply({
        embeds: [errorEmbed('Quest Not Found', 'The selected quest could not be found. Please try again.')],
        ephemeral: true,
      });
    }

    const questName = getQuestName(quest);
    const taskInfo = getTaskInfo(quest);
    const game = getGameTitle(quest) || getAppName(quest) || 'N/A';
    const typeEmojis = { VIDEO: EMOJIS.video, GAME: EMOJIS.game, STREAM: EMOJIS.stream, ACTIVITY: EMOJIS.activity, ACHIEVEMENT: EMOJIS.achievement };
    const typeLabel = taskInfo.type || 'Unknown';
    const typeIcon = typeEmojis[typeLabel] || '\u2753';

    await interaction.deferUpdate();

    // Update the message to show working state
    await interaction.editReply({
      embeds: [infoEmbed(
        'Working on Quest...',
        typeIcon + ' **' + questName + '**\n' +
        EMOJIS.dot + ' Type: `' + typeLabel + '`\n' +
        EMOJIS.dot + ' Game: ' + game + '\n' +
        (taskInfo.target > 0 ? EMOJIS.dot + ' Target: `' + taskInfo.target + '`\n' : '') +
        EMOJIS.loading + ' This may take a few minutes. Please wait...'
      )],
      components: [],
    });

    // If already completed, just claim
    if (isCompleted(quest) && !hasClaimed(quest)) {
      try {
        await claimReward(user.user_token, quest.id);
        return interaction.editReply({
          embeds: [successEmbed(
            'Rewards Claimed!',
            EMOJIS.trophy + ' **' + questName + '**\n\n' +
            EMOJIS.dot + ' Quest was already completed.\n' +
            EMOJIS.dot + ' Rewards have been successfully claimed!'
          )],
          components: [],
        });
      } catch (e) {
        return interaction.editReply({
          embeds: [errorEmbed(
            'Claim Failed',
            'Quest was completed but reward claim failed.\n\n' +
            EMOJIS.dot + ' **Error:** `' + e.message + '`\n' +
            EMOJIS.arrow + ' Try claiming manually from the Discord client.'
          )],
          components: [],
        });
      }
    }

    // Connect gateway before quest (matching Python flow)
    console.log(logPrefix + ' Connecting gateway for single quest...');
    const gwSession = createGatewaySession(user.user_token);
    try {
      const gwOk = await gwSession.ready;
      console.log(logPrefix + ' Gateway ' + (gwOk ? 'connected' : 'failed (continuing)'));
    } catch (_) {}

    try {
      const result = await completeQuestFull(user.user_token, quest, logPrefix, gwSession);

      if (result.success) {
        const fields = [
          { name: EMOJIS.quest + ' Quest', value: '**' + (result.questName || questName) + '**', inline: true },
          { name: EMOJIS.game + ' Game', value: game, inline: true },
          { name: EMOJIS.dot + ' Type', value: typeIcon + ' ' + typeLabel, inline: true },
        ];

        if (result.claimError) {
          fields.push({
            name: EMOJIS.warning + ' Claim Note',
            value: 'Completed but claim encountered an issue: `' + result.claimError + '`\nYou may need to claim manually from Discord.',
            inline: false,
          });
        }

        gwSession.destroy();
        return interaction.editReply({
          embeds: [successEmbed(
            'Quest Completed Successfully!',
            EMOJIS.trophy + ' Great job! Quest has been completed' + (result.claimError ? '' : ' and rewards claimed') + '.\n\n' +
            EMOJIS.info + ' _Use `/quest` to see remaining quests._'
          ).addFields(fields)],
          components: [],
        });
      } else {
        gwSession.destroy();
        return interaction.editReply({
          embeds: [errorEmbed(
          'Quest Failed',
          'Could not complete **' + questName + '**.\n\n' +
          EMOJIS.dot + ' **Reason:** `' + (result.error || 'Unknown error') + '`\n' +
          EMOJIS.dot + ' **Type:** ' + typeLabel + '\n' +
          EMOJIS.arrow + ' Try again later or use `/questall` to attempt all quests.'
        )],
          components: [],
        });
      }
    } catch (e) {
      gwSession.destroy();
      return interaction.editReply({
        embeds: [errorEmbed(
          'Unexpected Error',
          'An unexpected error occurred while processing your quest.\n\n' +
          EMOJIS.dot + ' **Error:** `' + e.message + '`\n' +
          EMOJIS.arrow + ' If this persists, use `/unlink` and `/link` with a fresh token.'
        )],
        components: [],
      });
    }
  },
};
