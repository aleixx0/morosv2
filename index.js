// index.js — MOROS BOT FINAL (con .steam)
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');

/* ===== CONFIG CLIENT ===== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

/* ===== VARIABLES ENV ===== */
const PREFIX = process.env.PREFIX || '!';
const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID;
const ALERTS_CHANNEL_ID = process.env.ALERTS_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const STAFF_INFO_CHANNEL_ID = process.env.STAFF_INFO_CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const WELCOME_BANNER = process.env.WELCOME_BANNER || 'https://i.imgur.com/qKkT3zD.png';
const PING_PATH = process.env.PING_PATH || '/ping';

const managerRoles = (process.env.MANAGER_ROLE_ID || '')
  .split(',').map(x => x.trim()).filter(Boolean);

const ALLOWED_GUILDS = (process.env.ALLOWED_GUILDS || '')
  .split(',').map(x => x.trim()).filter(Boolean);

/* ===== FUNCIONES BASE ===== */
function hasStaffPermission(member) {
  return (
    member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
    member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
    (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID)) ||
    managerRoles.some(r => member.roles.cache.has(r)) ||
    member.id === OWNER_ID
  );
}
function parseDuration(str) {
  const m = /^(\d+)\s*(s|m|h|d)$/i.exec(str || '');
  if (!m) return null;
  const n = Number(m[1]);
  const mult = { s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7 }[m[2].toLowerCase()];
  return n * mult;
}
let caseCounter = 1;
function createLogEmbed({ staff, action, target, reason }) {
  const unix = Math.floor(Date.now() / 1000);
  const caseId = String(caseCounter++).padStart(4, '0');
  return new EmbedBuilder()
    .setTitle(`🧾 Registro · Caso #${caseId}`)
    .addFields(
      { name: '👤 Staff', value: `${staff.user.tag} (${staff.id})` },
      { name: '🎯 Usuario', value: target ? `${target.user.tag} (${target.id})` : 'N/A' },
      { name: '⚙️ Acción', value: action, inline: true },
      { name: '📝 Razón', value: reason || 'No especificada', inline: true },
      { name: '⏰ Hora', value: `<t:${unix}:F> • <t:${unix}:R>` },
    )
    .setTimestamp();
}
async function logAction(staff, action, target, reason) {
  if (!LOG_CHANNEL_ID) return;
  const ch = staff.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (ch?.isTextBased()) ch.send({ embeds: [createLogEmbed({ staff, action, target, reason })] }).catch(()=>{});
}
async function logOwnerState(guild, staffMember, isOff) {
  if (!LOG_CHANNEL_ID) return;
  const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!ch?.isTextBased()) return;
  await ch.send({
    embeds: [new EmbedBuilder()
      .setTitle('🧾 Registro • Estado Owner/Managers')
      .addFields(
        { name: 'Acción', value: isOff ? 'OFF' : 'ONN', inline: true },
        { name: 'Ejecutado por', value: `${staffMember.user.tag} (${staffMember.id})`, inline: true },
      )
      .setTimestamp()
    ]
  });
}

/* ===== ARRANQUE ===== */
client.once('ready', () => {
  console.log(`✅ Conectado como ${client.user.tag}`);
  if (ALLOWED_GUILDS.length) {
    client.guilds.cache.forEach(g => { if (!ALLOWED_GUILDS.includes(g.id)) g.leave().catch(()=>{}); });
  }
});

/* ===== BIENVENIDA ===== */
client.on('guildMemberAdd', async (member) => {
  const ch = WELCOME_CHANNEL_ID && member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!ch?.isTextBased()) return;
  const botName = client.user?.username || 'nuestro bot';
  const embed = new EmbedBuilder()
    .setTitle('👋 ¡Bienvenid@! / Welcome!')
    .setDescription([
      '🇪🇸 **Bienvenid@ al servidor.**',
      `Hola ${member}, soy **${botName}**.`,
      'Disfruta del servidor y respeta a los demás.',
      'Escribe `.tos🇪🇸` para ver las normas.',
      '',
      '🇺🇸 **Welcome to the server!**',
      `Hi ${member}, I am **${botName}**.`,
      'Enjoy your stay and be respectful.',
      'Type `.tos🇺🇸` to read the rules.',
    ].join('\n'))
    .setImage(WELCOME_BANNER)
    .setColor('Blurple')
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  await ch.send({ content: `${member}`, embeds: [embed] }).catch(()=>{});
});

/* ===== MENSAJES ===== */
let ownerAway = false;
const mentionCooldown = new Set();
function setCooldown(key, ms = 30_000) {
  mentionCooldown.add(key);
  setTimeout(() => mentionCooldown.delete(key), ms);
}

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const content = message.content.trim();
  const lc = content.toLowerCase();

  /* ==== Auto respuesta cuando mencionan al Owner ==== */
  if (ownerAway && message.mentions.users.has(OWNER_ID)) {
    const key = `${message.channel.id}`;
    if (!mentionCooldown.has(key)) {
      setCooldown(key);
      await message.reply([
        '🇪🇸 **Está descansando o no conectado; responderá cuando pueda.**',
        '',
        '🇺🇸 **He is resting or unavailable; he will reply when possible.**',
      ].join('\n'));
    }
  }

  /* ==== .off / .onn ==== */
  const isOwner = OWNER_ID && message.author.id === OWNER_ID;
  const isManager = managerRoles.some((r) => message.member.roles.cache.has(r));
  const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
  const canControl = isOwner || isManager || isAdmin;

  if (['.off', '.descanso'].includes(lc)) {
    if (!canControl) return message.reply('❌ Solo el owner o managers pueden usar `.off`.');
    ownerAway = true;
    await message.reply([
      '🇪🇸 **Modo descanso activado.** Está descansando o no conectado.',
      '',
      '🇺🇸 **Rest mode activated.** He is currently unavailable.',
    ].join('\n'));
    await logOwnerState(message.guild, message.member, true);
    return;
  }

  if (['.onn', '.on', '.online'].includes(lc)) {
    if (!canControl) return message.reply('❌ Solo el owner o managers pueden usar `.onn`.');
    ownerAway = false;
    await message.reply([
      '🇪🇸 **Modo conectado activado.** Está disponible y responderá cuando pueda.',
      '',
      '🇺🇸 **Connected mode activated.** He is online and will reply soon.',
    ].join('\n'));
    await logOwnerState(message.guild, message.member, false);
    return;
  }

  /* ==== .code ==== */
  if (lc.startsWith('.code')) {
    if (!hasStaffPermission(message.member)) return;
    await message.delete().catch(()=>{});
    const body = content.slice('.code'.length).trim();
    if (!body) {
      await message.channel.send('⚠️ Escribe el texto. Ej: `.code Código MOROS-2025 | Reacciona para recibirlo`')
        .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle('🧩 CODE')
      .setDescription(body)
      .setColor(0x00AEEF)
      .setFooter({ text: `Enviado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return;
  }

  /* ==== .steam ==== */
  if (lc.startsWith('.steam')) {
    if (!hasStaffPermission(message.member)) return;
    await message.delete().catch(()=>{});
    const body = content.slice('.steam'.length).trim();
    if (!body) {
      await message.channel.send('⚠️ Escribe el texto. Ej: `.steam Entra al grupo Steam y reacciona con 🔥`')
        .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle('🔥 STEAM')
      .setDescription(body)
      .setColor(0x1B2838)
      .setFooter({ text: `Enviado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return;
  }

  /* ==== .raidroles ==== */
  if (lc.startsWith('.raidroles')) {
    if (!hasStaffPermission(message.member)) return;
    await message.delete().catch(()=>{});
    const body = content.slice('.raidroles'.length).trim();
    const embed = new EmbedBuilder()
      .setTitle('🚨 Raid Roles')
      .setDescription(body || 'Reacciona con ✅ para unirte a la raid.')
      .setColor(0xFF3B30)
      .setFooter({ text: `Enviado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return;
  }

  /* ==== .wiperoles ==== */
  if (lc.startsWith('.wiperoles')) {
    if (!hasStaffPermission(message.member)) return;
    await message.delete().catch(()=>{});
    const body = content.slice('.wiperoles'.length).trim();
    const embed = new EmbedBuilder()
      .setTitle('🧹 Wipe Roles')
      .setDescription(body || 'Reacciona para recibir el rol de wipe.')
      .setColor(0x34C759)
      .setFooter({ text: `Enviado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return;
  }

  /* ==== .serverstats ==== */
  if (lc === '.serverstats') {
    const g = message.guild;
    const text = g.channels.cache.filter(c => [0,5,15,16].includes(c.type)).size;
    const voice = g.channels.cache.filter(c => [2,13].includes(c.type)).size;
    const cats = g.channels.cache.filter(c => c.type === 4).size;
    const members = g.memberCount;
    const bots = g.members.cache.filter(m => m.user.bot).size;
    const humans = members - bots;
    const roles = g.roles.cache.size;
    const emojis = g.emojis.cache.size;
    const boosts = g.premiumSubscriptionCount ?? 0;
    const tier = g.premiumTier ?? 0;
    const embed = new EmbedBuilder()
      .setTitle(`📊 Estadísticas de ${g.name}`)
      .addFields(
        { name: '👥 Miembros', value: `Total: ${members}\nHumanos: ${humans}\nBots: ${bots}`, inline: true },
        { name: '📡 Canales', value: `Texto: ${text}\nVoz: ${voice}\nCategorías: ${cats}`, inline: true },
        { name: '💎 Boosts', value: `Nivel: ${tier}\nBoosts: ${boosts}`, inline: true },
        { name: '🧩 Roles & Emojis', value: `Roles: ${roles}\nEmojis: ${emojis}`, inline: true },
        { name: '📅 Creado', value: `<t:${Math.floor(g.createdTimestamp/1000)}:F>`, inline: false },
      )
      .setColor('Aqua')
      .setThumbnail(g.iconURL({ size: 256 }))
      .setTimestamp();
    await message.reply({ embeds: [embed] });
    return;
  }

  /* ==== .love ==== */
  if (lc.startsWith('.love')) {
    const args = content.split(' ').slice(1);
    const target = args.join(' ');
    if (!target) return message.reply('❤️ ¿Con quién? Ejemplo: `.love @usuario`');
    const percent = Math.floor(Math.random() * 101);
    const frases = ['💞 Están hechos el uno para el otro 💞','💔 Mejor amigos... nada más 💔','🔥 Química peligrosa 🔥','😅 No pinta bien...','❤️ Cupido aprueba esta unión ❤️'];
    const frase = frases[Math.floor(Math.random() * frases.length)];
    await message.reply(`💘 El amor entre tú y **${target}** es de **${percent}%**\n${frase}`);
    return;
  }

  /* ==== .clear ==== */
  if (lc.startsWith('.clear')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return message.reply('❌ No tienes permiso para usar `.clear`.');
    const cantidad = parseInt(content.split(' ')[1]) || 10;
    await message.channel.bulkDelete(cantidad + 1, true).catch(()=>{});
    const confirm = await message.channel.send(`🧹 Borrados **${cantidad}** mensajes.`);
    setTimeout(() => confirm.delete().catch(()=>{}), 3000);
    return;
  }

  /* ==== .p ==== */
  if (lc === '.p') {
    const random = Math.floor(Math.random() * (24 - 3 + 1)) + 3;
    await message.reply(`🎯 Tu número aleatorio es: **${random}**`);
    return;
  }
});

/* ===== MINI WEB 24/7 ===== */
const app = express();
app.get(PING_PATH, (_req, res) => res.send('✅ Bot activo y en línea.'));
app.use((_req, res) => res.sendStatus(404));
app.listen(3000, () => console.log(`🌐 Servidor web activo en ${PING_PATH}`));

/* ===== LOGIN ===== */
client.login(process.env.DISCORD_TOKEN);
