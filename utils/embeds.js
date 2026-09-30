const { EmbedBuilder } = require('discord.js');

const PALETTE = {
  blurple:   0x5865F2,
  green:     0x57F287,
  yellow:   0xFEE75C,
  red:       0xED4245,
  fuchsia:   0xEB459E,
  cyan:      0x00D4AA,
  orange:    0xF97316,
  white:     0xFFFFFF,
  dark:      0x2B2D31,
  darker:    0x1E1F22,
};

const BOT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';
const BOT_NAME = 'Zuest';

const EMOJIS = {
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
  trophy: '\uD83C\uDFC6',
  game: '\uD83C\uDFAE',
  video: '\uD83C\uDFAC',
  stream: '\uD83D\uDCF9',
  activity: '\uD83C\uDFAF',
  achievement: '\uD83C\uDFC5',
  arrow: '\u27A1\uFE0F',
  dot: '\u2022',
  divider: '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
  separator: '\u25AC\u25AC\u25AC\u25AC\u25AC\u25AC\u25AC\u25AC\u25AC\u25AC',
};

function progressBar(current, target, length) {
  length = length || 15;
  if (target <= 0) return '\u2588'.repeat(length) + ' 100%';
  const pct = Math.min(100, Math.round((current / target) * 100));
  const filled = Math.round((pct / 100) * length);
  const empty = length - filled;
  const bar = '\uD83D\uDFE9'.repeat(filled) + '\u26AB'.repeat(empty);
  return bar + ' ' + pct + '%';
}

function statusBadge(status) {
  const map = {
    claimed:    { icon: '\uD83C\uDFC6', text: 'Claimed',       color: 'yellow' },
    completed:  { icon: '\u2705', text: 'Completed',     color: 'green' },
    enrolled:   { icon: '\u23F3', text: 'In Progress',   color: 'blurple' },
    available:  { icon: '\uD83C\uDFAF', text: 'Available',     color: 'cyan' },
    expired:    { icon: '\u23F0', text: 'Expired',       color: 'red' },
    failed:     { icon: '\u274C', text: 'Failed',        color: 'red' },
    unsupported:{ icon: '\u2753', text: 'Unsupported',   color: 'dark' },
  };
  const s = map[status] || map.available;
  return s.icon + ' \u200B`' + s.text + '`';
}

function fieldDivider() {
  return { name: EMOJIS.separator, value: '\u200B', inline: false };
}

function createEmbed(opts) {
  const { title, description, color, fields, footer, thumbnail, image, author, timestamp, url } = opts;
  const embed = new EmbedBuilder();

  if (color) {
    embed.setColor(typeof color === 'string' ? (PALETTE[color] || PALETTE.blurple) : color);
  } else {
    embed.setColor(PALETTE.blurple);
  }

  if (title) embed.setTitle(title);
  if (url) embed.setURL(url);
  if (description) embed.setDescription(description);
  if (fields && fields.length) embed.addFields(fields);
  if (image) embed.setImage(image);
  if (thumbnail) embed.setThumbnail(thumbnail);

  if (author) {
    embed.setAuthor(author);
  } else {
    embed.setAuthor({ name: BOT_NAME, iconURL: BOT_AVATAR });
  }

  if (footer) {
    embed.setFooter(footer);
  } else {
    embed.setFooter({ text: '\u2022 Zuest Bot \u2022 Built By Arsh', iconURL: BOT_AVATAR });
  }

  if (timestamp !== false) embed.setTimestamp();

  return embed;
}

function successEmbed(title, description, opts) {
  return createEmbed({ title: EMOJIS.success + '  ' + title, description, color: 'green', ...opts });
}

function errorEmbed(title, description, opts) {
  return createEmbed({ title: EMOJIS.error + '  ' + title, description, color: 'red', ...opts });
}

function infoEmbed(title, description, opts) {
  return createEmbed({ title: EMOJIS.info + '  ' + title, description, color: 'blurple', ...opts });
}

function warningEmbed(title, description, opts) {
  return createEmbed({ title: EMOJIS.warning + '  ' + title, description, color: 'yellow', ...opts });
}

module.exports = {
  createEmbed, successEmbed, errorEmbed, infoEmbed, warningEmbed,
  PALETTE, EMOJIS, progressBar, statusBadge, fieldDivider,
  BOT_AVATAR, BOT_NAME,
};
