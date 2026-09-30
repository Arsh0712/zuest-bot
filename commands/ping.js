const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed, EMOJIS, PALETTE } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Check Zuest's response latency."),

  async execute(interaction) {
    const sent = Date.now();

    await interaction.reply({
      embeds: [infoEmbed(
        'Pinging...',
        EMOJIS.loading + ' Measuring round-trip and WebSocket latency...'
      )],
    });

    const latency = Date.now() - sent;
    const apiLatency = Math.round(interaction.client.ws.ping);

    const isFast = latency < 200;
    const isOkay = latency < 500;

    const embed = infoEmbed(
      isFast ? 'Pong! Fast Response' : isOkay ? 'Pong! Normal Response' : 'Pong! Slow Response',
      EMOJIS.bot + ' **Round-trip:** `' + latency + 'ms' + (isFast ? ' (fast!)' : '') + '`\n' +
      EMOJIS.shield + ' **WebSocket:** `' + apiLatency + 'ms' + (apiLatency < 100 ? ' (excellent)' : '') + '`'
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
