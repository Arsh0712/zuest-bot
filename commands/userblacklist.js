const { SlashCommandBuilder, User } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, createEmbed, EMOJIS } = require('../utils/embeds');
const { stmts } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userblacklist')
    .setDescription('Manage the global bot blacklist.')
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a user to the blacklist.')
        .addUserOption(opt => opt.setName('user').setDescription('The user to blacklist.').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for blacklisting.').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a user from the blacklist.')
        .addUserOption(opt => opt.setName('user').setDescription('The user to unblacklist.').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('View all blacklisted users.')
    ),

  ownerOnly: true,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      stmts.addToBlacklist.run(target.id, reason);

      return interaction.reply({
        embeds: [successEmbed(
          'User Blacklisted',
          EMOJIS.shield + ' **' + target.tag + '** (`' + target.id + '`) has been blacklisted.\n\n' +
          EMOJIS.dot + ' **Reason:** ' + reason
        )],
      });
    }

    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      stmts.removeFromBlacklist.run(target.id);

      return interaction.reply({
        embeds: [successEmbed(
          'User Unblacklisted',
          EMOJIS.success + ' **' + target.tag + '** (`' + target.id + '`) has been removed from the blacklist.'
        )],
      });
    }

    if (sub === 'list') {
      const list = stmts.getBlacklist.all();

      if (list.length === 0) {
        return interaction.reply({
          embeds: [infoEmbed(
            'Blacklist Empty',
            EMOJIS.info + ' No users are currently blacklisted.'
          )],
        });
      }

      const fields = list.map(row => ({
        name: EMOJIS.error + ' ' + row.user_id,
        value: EMOJIS.dot + ' **Reason:** ' + row.reason + '\n' + EMOJIS.dot + ' **Added:** <t:' + row.added_at + ':R>',
        inline: false,
      }));

      const embed = createEmbed({
        title: EMOJIS.shield + '  Blacklist (' + list.length + ')',
        fields: fields.slice(0, 25),
        color: 'red',
      });

      if (list.length > 25) {
        embed.setFooter({ text: 'Showing 25 of ' + list.length + ' entries' });
      }

      return interaction.reply({ embeds: [embed] });
    }
  },
};
