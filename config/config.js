require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  ownerId: process.env.OWNER_ID,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  publicKey: process.env.PUBLIC_KEY,
  dbPath: process.env.DB_PATH || './data/zuest.db',
  questCheckInterval: (process.env.QUEST_CHECK_INTERVAL || 30) * 60 * 1000,

  colors: {
    primary: 0x5865F2,
    success: 0x57F287,
    warning: 0xFEE75C,
    error: 0xED4245,
    info: 0x5865F2,
  },

  emojis: {
    success: '\u2705',
    error: '\u274C',
    warning: '\u26A0\uFE0F',
    info: '\u2139\uFE0F',
    loading: '\u23F3',
    quest: '\uD83C\uDFAF',
    link: '\uD83D\uDD17',
    unlink: '\uD83D\uDD13',
    bot: '\uD83E\uDD16',
    shield: '\uD83D\uDEE1\uFE0F',
    server: '\uD83C\uDFE0',
    channel: '\uD83D\uDCAC',
  },
};
