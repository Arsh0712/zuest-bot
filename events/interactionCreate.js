const { PermissionFlagsBits } = require('discord.js');
const { isOwner, isBlacklisted, isGuildAllowed, isChannelAllowed } = require('../utils/permissions');
const { errorEmbed, EMOJIS } = require('../utils/embeds');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // Handle StringSelect interactions (quest select menu)
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;

      // quest_select_{userId}
      if (customId.startsWith('quest_select_')) {
        const targetUserId = customId.replace('quest_select_', '');

        // Only the user who invoked the command can use the select menu
        if (interaction.user.id !== targetUserId) {
          return interaction.reply({
            embeds: [errorEmbed('Not Allowed', 'This quest menu belongs to someone else.')],
            ephemeral: true,
          });
        }

        // Blacklist check
        if (isBlacklisted(interaction.user.id)) {
          return interaction.reply({
            embeds: [errorEmbed('Blacklisted', 'You are blacklisted from using Zuest.')],
            ephemeral: true,
          });
        }

        const questCommand = client.commands.get('quest');
        if (questCommand && questCommand.handleSelect) {
          try {
            await questCommand.handleSelect(interaction);
          } catch (error) {
            console.error('[SelectMenu] Error handling quest select:', error);
            const errMsg = error.message || 'Unknown error';
            const errEmbed = errorEmbed(
              'Selection Error',
              EMOJIS.error + ' An error occurred while processing your selection.\n\n' +
              EMOJIS.dot + ' **Error:** `' + errMsg + '`\n' +
              EMOJIS.arrow + ' Please try again with `/quest`.'
            );
            if (interaction.replied || interaction.deferred) {
              await interaction.editReply({ embeds: [errEmbed], components: [] });
            } else {
              await interaction.reply({ embeds: [errEmbed], ephemeral: true });
            }
          }
        }
        return;
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    const userId = interaction.user.id;

    // Global blacklist check
    if (isBlacklisted(userId)) {
      return interaction.reply({
        embeds: [errorEmbed('Blacklisted', 'You are blacklisted from using Zuest.')],
        ephemeral: true,
      });
    }

    // Guild checks
    if (interaction.guild) {
      if (!isGuildAllowed(interaction.guild.id)) {
        return interaction.reply({
          embeds: [errorEmbed('Not Authorized', 'This server is not authorized to use Zuest.')],
          ephemeral: true,
        });
      }

      if (!isChannelAllowed(interaction.guild.id, interaction.channel.id)) {
        const { stmts } = require('../database/db');
        const setting = stmts.getGuildSetting.get(interaction.guild.id);
        const ch = setting && setting.restricted_channel_id ? setting.restricted_channel_id : '';
        return interaction.reply({
          embeds: [errorEmbed('Wrong Channel', 'Zuest commands are restricted to <#' + ch + '>.')],
          ephemeral: true,
        });
      }
    }

    // Owner-only check
    if (command.ownerOnly && !isOwner(userId)) {
      return interaction.reply({
        embeds: [errorEmbed('Owner Only', 'This command is restricted to the bot owner.')],
        ephemeral: true,
      });
    }

    // Admin check
    if (command.adminOnly) {
      if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          embeds: [errorEmbed('Admin Required', 'You need **Administrator** permission to use this command.')],
          ephemeral: true,
        });
      }
    }

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error('[Command] Error executing /' + interaction.commandName + ':', error);

      const errMsg = error.message || 'Unknown error';
      const errEmbed = errorEmbed(
        'Command Error',
        EMOJIS.error + ' An error occurred while executing `/' + interaction.commandName + '`.' + '\n\n' +
        EMOJIS.dot + ' **Error:** `' + errMsg + '`' + '\n' +
        EMOJIS.arrow + ' If this persists, contact support.'
      );

      const reply = { embeds: [errEmbed] };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
