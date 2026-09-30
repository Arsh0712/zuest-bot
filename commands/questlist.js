const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { infoEmbed, errorEmbed, EMOJIS, PALETTE, progressBar, statusBadge } = require('../utils/embeds');
const { stmts } = require('../database/db');
const {
  fetchQuests, filterValidQuests, getQuestName, getGameTitle, getAppName,
  isCompleted, isEnrolled, hasClaimed, isExpired, getTaskInfo,
} = require('../utils/questAPI');

const TYPE_LABELS = {
  VIDEO: 'Watch Video',
  GAME: 'Play on Desktop',
  STREAM: 'Stream',
  ACTIVITY: 'Play Activity',
  ACHIEVEMENT: 'Achievement',
};

const TYPE_ICONS = {
  VIDEO: EMOJIS.video,
  GAME: EMOJIS.game,
  STREAM: EMOJIS.stream,
  ACTIVITY: EMOJIS.activity,
  ACHIEVEMENT: EMOJIS.achievement,
};

const PER_PAGE = 5;

function getStatus(q) {
  if (hasClaimed(q)) return 'claimed';
  if (isCompleted(q)) return 'completed';
  if (isExpired(q)) return 'expired';
  if (isEnrolled(q)) return 'enrolled';
  return 'available';
}

function buildQuestFields(quests, page, perPage) {
  const start = (page - 1) * perPage;
  const pageQuests = quests.slice(start, start + perPage);
  const fields = [];

  for (const q of pageQuests) {
    const qName = getQuestName(q);
    const game = getGameTitle(q);
    const app = getAppName(q);
    const info = getTaskInfo(q);
    const status = getStatus(q);

    const typeLabel = info.type ? (TYPE_LABELS[info.type] || info.type) : 'Unknown';
    const typeIcon = info.type ? (TYPE_ICONS[info.type] || '\u2753') : '\u2753';
    const supported = info.type && info.type !== null;

    let value = '';
    value += statusBadge(status);
    value += '  ' + typeIcon + ' Type: `' + typeLabel + '` ' + (supported ? '' : '~~(unsupported)~~');
    value += '\n';

    if (info.target > 0 && status !== 'claimed') {
      const pct = info.target > 0 ? Math.min(100, Math.round((info.done / info.target) * 100)) : 0;
      value += progressBar(info.done, info.target, 12) + ' `' + Math.floor(info.done) + '/' + info.target + '`';
      value += '\n';
    }

    if (game) value += EMOJIS.game + ' ' + game;
    else if (app) value += EMOJIS.bot + ' ' + app;

    fields.push({ name: qName, value: value, inline: false });
  }

  return fields;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('questlist')
    .setDescription('View all your quests with pagination.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const user = stmts.getUser.get(userId);

    if (!user || !user.user_token) {
      return interaction.reply({
        embeds: [errorEmbed(
          'Account Not Linked',
          'You must link your account first. Use `/link` to provide your token.\n\n' +
          EMOJIS.arrow + ' Your token is stored securely and used only for quest operations.'
        )],
      });
    }

    await interaction.deferReply();

    let response;
    try { response = await fetchQuests(user.user_token); }
    catch (e) {
      return interaction.editReply({
        embeds: [errorEmbed(
          'Fetch Failed',
          'Could not retrieve quests. Token may be invalid.\n\n' +
          EMOJIS.dot + ' **Error:** `' + e.message + '`\n' +
          EMOJIS.arrow + ' Use `/tokencheck` to verify.'
        )],
      });
    }

    const allQuests = (response && response.quests) || [];
    if (allQuests.length === 0) {
      return interaction.editReply({
        embeds: [infoEmbed(
          'No Quests',
          'There are currently no quests on your account.\n\n' +
          EMOJIS.dot + ' Discord releases quests during gaming events.\n' +
          EMOJIS.dot + ' Enable `/autoquest` for automatic handling.\n\n' +
          EMOJIS.info + ' _Check back later!_'
        )],
      });
    }

    const totalPages = Math.ceil(allQuests.length / PER_PAGE);
    let currentPage = 1;

    const availableCount = allQuests.filter(q => !isCompleted(q) && !isExpired(q)).length;
    const completedCount = allQuests.filter(q => isCompleted(q)).length;
    const claimedCount = allQuests.filter(q => hasClaimed(q)).length;

    function makeEmbed(page) {
      const fields = buildQuestFields(allQuests, page, PER_PAGE);

      const summary =
        EMOJIS.quest + ' **Total:** ' + allQuests.length + '  ' +
        EMOJIS.dot + ' **Available:** ' + availableCount + '  ' +
        EMOJIS.success + ' **Completed:** ' + completedCount + '  ' +
        EMOJIS.trophy + ' **Claimed:** ' + claimedCount;

      const embed = infoEmbed(
        'Your Quests',
        summary + '\n\n' +
        '_All quest types are supported: Video, Play on Desktop, Stream, Activity, Achievement._\n' +
        '_LINK_ACCOUNT quests require manual linking and cannot be automated._'
      ).addFields(fields);

      if (totalPages > 1) {
        embed.setFooter({
          text: 'Page ' + page + ' of ' + totalPages + '  |  ' + allQuests.length + ' quest(s) total  |  Zuest Bot',
          iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png',
        });
      }

      return embed;
    }

    function makeButtons(page) {
      const row = new ActionRowBuilder();
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('ql_prev')
          .setLabel('Previous')
          .setEmoji('\u25C0')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId('ql_page')
          .setLabel(page + ' / ' + totalPages)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('ql_next')
          .setLabel('Next')
          .setEmoji('\u25B6')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
      );
      return row;
    }

    const msg = await interaction.editReply({
      embeds: [makeEmbed(currentPage)],
      components: totalPages > 1 ? [makeButtons(currentPage)] : [],
    });

    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: (i) => i.user.id === interaction.user.id,
    });

    collector.on('collect', async (btnInt) => {
      if (btnInt.customId === 'ql_prev' && currentPage > 1) currentPage--;
      else if (btnInt.customId === 'ql_next' && currentPage < totalPages) currentPage++;

      await btnInt.update({
        embeds: [makeEmbed(currentPage)],
        components: [makeButtons(currentPage)],
      });
    });

    collector.on('end', () => {
      interaction.editReply({
        embeds: [makeEmbed(currentPage)],
        components: [],
      }).catch(() => {});
    });
  },
};
