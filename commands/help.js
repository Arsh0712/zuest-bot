const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, EMOJIS, PALETTE } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all available Zuest commands and usage guide.'),

  async execute(interaction) {
    const embed = createEmbed({
      title: EMOJIS.bot + '  Zuest Bot — Command Guide',
      description:
        'Zuest is a powerful Discord Quest Assistant that automatically completes **all types** of Discord quests — ' +
        'Video, Play on Desktop, Stream, Activity, and Achievement quests. Fast, reliable, and always online.',
      color: PALETTE.blurple,
      fields: [
        {
          name: EMOJIS.link + '  Account Commands',
          value:
            '`/link <token>` — Link your Discord account (ephemeral — only you see this)\n' +
            '`/unlink` — Remove your account connection\n' +
            '`/tokencheck` — Verify your connection status & token health',
          inline: false,
        },
        {
          name: EMOJIS.quest + '  Quest Commands',
          value:
            '`/quest` — Complete one available quest automatically\n' +
            '`/questall` — Complete & claim ALL supported quests at once\n' +
            '`/questlist` — Browse all quests with detailed status & pagination\n' +
            '`/autoquest` — Toggle automatic quest completion every 30 min',
          inline: false,
        },
        {
          name: EMOJIS.info + '  Utility',
          value:
            '`/ping` — Check bot response latency\n' +
            '`/help` — View this command guide',
          inline: false,
        },
        {
          name: EMOJIS.shield + '  Supported Quest Types',
          value:
            EMOJIS.video + ' **Watch Video** / Watch Video on Mobile\n' +
            EMOJIS.game + ' **Play on Desktop** / Play on Mobile / Play Game\n' +
            EMOJIS.stream + ' **Stream on Desktop** / Watch Stream\n' +
            EMOJIS.activity + ' **Play Activity**\n' +
            EMOJIS.achievement + ' **Achievement in Activity** (with Discord Says bypass)\n\n' +
            EMOJIS.warning + ' LINK_ACCOUNT quests require manual linking.',
          inline: false,
        },
        {
          name: EMOJIS.shield + '  Getting Started',
          value:
            '1. Use `/link` with your Discord user token (from DevTools)\n' +
            '2. Use `/questlist` to see all your quests\n' +
            '3. Use `/questall` to complete everything at once\n' +
            '4. Enable `/autoquest` for hands-free quest farming',
          inline: false,
        },
        {
          name: EMOJIS.warning + '  Security',
          value:
            EMOJIS.dot + ' Your token is stored securely and never shared\n' +
            EMOJIS.dot + ' Only you see the `/link` command response\n' +
            EMOJIS.dot + ' Use `/unlink` to instantly delete your data',
          inline: false,
        },
      ],
      thumbnail: 'https://cdn.discordapp.com/embed/avatars/0.png',
    });

    await interaction.reply({ embeds: [embed] });
  },
};
