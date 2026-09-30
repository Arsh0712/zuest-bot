const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, createEmbed, EMOJIS } = require('../utils/embeds');
const { stmts } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelistserver')
    .setDescription('Manage the server whitelist.')
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a server to the whitelist.')
        .addStringOption(opt =>
          opt.setName('id').setDescription('The server (guild) ID.').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a server from the whitelist.')
        .addStringOption(opt =>
          opt.setName('id').setDescription('The server (guild) ID.').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('list').setDescription('View all whitelisted servers.')
    )
    .addSubcommand(sub =>
      sub.setName('clear').setDescription('Clear the entire whitelist (allows all servers).')
    ),

  ownerOnly: true,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const guildId = interaction.options.getString('id');
      stmts.addToWhitelist.run(guildId);
      return interaction.reply({
        embeds: [successEmbed(
          'Server Whitelisted',
          EMOJIS.server + ' Server `' + guildId + '` has been added to the whitelist.'
        )],
      });
    }

    if (sub === 'remove') {
      const guildId = interaction.options.getString('id');
      stmts.removeFromWhitelist.run(guildId);
      return interaction.reply({
        embeds: [successEmbed(
          'Server Removed',
          EMOJIS.server + ' Server `' + guildId + '` has been removed from the whitelist.'
        )],
      });
    }

    if (sub === 'clear') {
      const db = require('../database/db').db;
      db.exec('DELETE FROM server_whitelist');
      return interaction.reply({
        embeds: [successEmbed(
          'Whitelist Cleared',
          EMOJIS.success + ' The server whitelist has been cleared.\n\n' +
          EMOJIS.dot + ' All servers are now allowed to use Zuest.'
        )],
      });
    }

    if (sub === 'list') {
      const list = stmts.getWhitelist.all();

      if (list.length === 0) {
        return interaction.reply({
          embeds: [infoEmbed(
            'Whitelist Open',
            EMOJIS.server + ' The whitelist is empty — all servers are currently allowed.'
          )],
        });
      }

      const fields = list.map(row => ({
        name: EMOJIS.server + ' ' + row.guild_id,
        value: EMOJIS.dot + ' **Added:** <t:' + row.added_at + ':R>',
        inline: false,
      }));

      const embed = createEmbed({
        title: EMOJIS.server + '  Whitelisted Servers (' + list.length + ')',
        fields,
        color: 'success',
      });

      return interaction.reply({ embeds: [embed] });
    }
  },
};
