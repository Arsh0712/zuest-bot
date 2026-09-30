const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, EMOJIS } = require('../utils/embeds');
const { stmts } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Restrict Zuest commands to a specific channel.')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel to restrict commands to. Omit to remove restriction.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  adminOnly: true,

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        embeds: [errorEmbed('Guild Only', EMOJIS.error + ' This command can only be used in a server.')],
        ephemeral: true,
      });
    }

    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guild.id;

    if (!channel) {
      stmts.removeGuildSetting.run(guildId);
      return interaction.reply({
        embeds: [successEmbed(
          'Restriction Removed',
          EMOJIS.success + ' Zuest commands can now be used in any channel.'
        )],
      });
    }

    stmts.setGuildChannel.run(guildId, channel.id);

    return interaction.reply({
      embeds: [successEmbed(
        'Channel Restricted',
        EMOJIS.channel + ' Zuest commands are now restricted to ' + channel + '.\n\n' +
        EMOJIS.dot + ' Users will get an error if they use commands in other channels.'
      )],
    });
  },
};
