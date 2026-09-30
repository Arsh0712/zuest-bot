const config = require('../config/config');
const { stmts } = require('../database/db');

/**
 * Check if a user is the bot owner.
 */
function isOwner(userId) {
  return userId === config.ownerId;
}

/**
 * Check if a user is blacklisted.
 */
function isBlacklisted(userId) {
  const row = stmts.isBlacklisted.get(userId);
  return !!row;
}

/**
 * Check if a guild is whitelisted (when whitelist is in use).
 * Returns true if the whitelist is empty (open to all servers) or the guild is in the whitelist.
 */
function isGuildAllowed(guildId) {
  const count = stmts.getWhitelist.all();
  // If whitelist is empty, all servers are allowed
  if (count.length === 0) return true;
  const row = stmts.isWhitelisted.get(guildId);
  return !!row;
}

/**
 * Check if the command is allowed in the current channel.
 * Returns true if no channel restriction is set, or if the message is in the restricted channel.
 */
function isChannelAllowed(guildId, channelId) {
  const setting = stmts.getGuildSetting.get(guildId);
  if (!setting || !setting.restricted_channel_id) return true;
  return setting.restricted_channel_id === channelId;
}

module.exports = { isOwner, isBlacklisted, isGuildAllowed, isChannelAllowed };
