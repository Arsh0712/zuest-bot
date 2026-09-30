const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, infoEmbed, EMOJIS } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('servers')
    .setDescription('View the servers Zuest is currently in.'),

  ownerOnly: true,

  async execute(interaction, client) {
    const guilds = client.guilds.cache;

    if (guilds.size === 0) {
      return interaction.reply({
        embeds: [infoEmbed(
          'No Servers',
          EMOJIS.server + ' Zuest is not in any servers yet.'
        )],
      });
    }

    const fields = guilds.map(guild => ({
      name: EMOJIS.server + ' ' + guild.name,
      value: EMOJIS.dot + ' **ID:** `' + guild.id + '`\n' + EMOJIS.dot + ' **Members:** ' + guild.memberCount + '\n' + EMOJIS.dot + ' **Owner:** <@' + guild.ownerId + '>',
      inline: false,
    }));

    const embed = createEmbed({
      title: EMOJIS.server + '  Servers (' + guilds.size + ')',
      fields: fields.slice(0, 25),
      color: 'primary',
    });

    if (guilds.size > 25) {
      embed.setFooter({ text: 'Showing 25 of ' + guilds.size + ' servers' });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
