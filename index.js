// index.js
// Bot MOROS — CommonJS
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');

/* ==== Client ==== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

/* ==== ENV / Config ==== */
const PREFIX = process.env.PREFIX || '!';
const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID;
const ALERTS_CHANNEL_ID = process.env.ALERTS_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const STAFF_INFO_CHANNEL_ID = process.env.STAFF_INFO_CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const WELCOME_BANNER =
  process.env.WELCOME_BANNER || 'https://i.imgur.com/qKkT3zD.png';
const PING_PATH = process.env.PING_PATH || '/ping';

const managerRoles = (process.env.MANAGER_ROLE_ID || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

const ALLOWED_GUILDS = (process.env.ALLOWED_GUILDS || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

/* ==== Helpers ==== */
function hasStaffPermission(member) {
  return (
    member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
    member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
    (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID)) ||
    managerRoles.some((r) => member.roles.cache.has(r)) ||
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
  if (ch?.isTextBased()) ch.send({ embeds: [createLogEmbed({ staff, action, target, reason })] }).catch(() => {});
}
async function logOwnerState(guild, staffMember, isOff) {
  if (!LOG_CHANNEL_ID) return;
  const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!ch?.isTextBased()) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('🧾 Registro • Estado Owner/Managers')
        .addFields(
          { name: 'Acción', value: isOff ? 'OFF' : 'ONN', inline: true },
          { name: 'Ejecutado por', value: `${staffMember.user.tag} (${staffMember.id})`, inline: true },
        )
        .setTimestamp(),
    ],
  });
}
function buildStaffHelpEmbed(prefix = PREFIX) {
  return new EmbedBuilder()
    .setTitle('ℹ️ Comandos de Staff')
    .setDescription(
      [
        `Usa estos comandos en <#${STAFF_CHANNEL_ID}>`,
        '',
        `\`${prefix}ban @usuario [razón]\``,
        `\`${prefix}kick @usuario [razón]\``,
        `\`${prefix}timeout @usuario <30s|10m|2h|7d> [razón]\``,
        `\`${prefix}alert @usuario [mensaje]\``,
        '',
        '`!helpmoros` — ayuda',
        '`.announcements <texto>` — anuncio',
        '`.wipe <texto>` — anuncio con imagen',
        '`.clear 10` — borrar mensajes',
        '`.p` — número aleatorio 3–24',
      ].join('\n'),
    )
    .setFooter({ text: 'Solo personal autorizado.' })
    .setTimestamp();
}

/* ==== Ready / Guild guard ==== */
client.once('ready', () => {
  console.log(`✅ Conectado como ${client.user.tag}`);
  if (ALLOWED_GUILDS.length) {
    client.guilds.cache.forEach((g) => {
      if (!ALLOWED_GUILDS.includes(g.id)) g.leave().catch(() => {});
    });
  }
});
client.on('guildCreate', (guild) => {
  if (ALLOWED_GUILDS.length && !ALLOWED_GUILDS.includes(guild.id)) {
    guild.leave().catch(() => {});
  }
});

/* ==== Bienvenida ==== */
client.on('guildMemberAdd', async (member) => {
  const ch = WELCOME_CHANNEL_ID && member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!ch?.isTextBased()) return;

  const botName = client.user?.username || 'nuestro bot';

  const embed = new EmbedBuilder()
    .setTitle('👋 ¡Bienvenid@! / Welcome!')
    .setDescription(
      [
        '🇪🇸 **Bienvenid@ al servidor.**',
        `Hola ${member}, soy **${botName}**.`,
        'Disfruta del servidor; mantén el respeto y pásalo bien.',
        'Escribe `.tos🇪🇸` para ver normas.',
        '',
        '🇺🇸 **Welcome to the server!**',
        `Hi ${member}, I am **${botName}**.`,
        'Enjoy your stay and be respectful.',
        'Type `.tos🇺🇸` to see the rules.',
      ].join('\n'),
    )
    .setColor('Blurple')
    .setImage(WELCOME_BANNER)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `${member.guild.name} • Miembro #${member.guild.memberCount}` })
    .setTimestamp();

  await ch.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
});

/* ==== Mensajes ==== */
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

  /* Auto-respuesta si mencionan al owner en OFF */
  if (ownerAway && message.mentions.users.has(OWNER_ID)) {
    const key = `${message.channel.id}`;
    if (!mentionCooldown.has(key)) {
      setCooldown(key);
      await message.reply(
        [
          '🇪🇸 **Está descansando o no conectado; responderá cuando pueda.**',
          '',
          '🇺🇸 **He is resting or unavailable; he will reply when possible.**',
        ].join('\n'),
      );
    }
  }

  /* ---- .off / .onn / .restart (owner/manager/admin) ---- */
  const isOwner = OWNER_ID && message.author.id === OWNER_ID;
  const isManager = managerRoles.some((r) => message.member.roles.cache.has(r));
  const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
  const canControl = isOwner || isManager || isAdmin;

  const isOffCmd = lc === '.off' || lc === '.away' || lc === '.descanso';
  const isOnCmd = lc === '.onn' || lc === '.on' || lc === '.online' || lc === '.vuelve';
  const isRestartCmd = lc === '.restart' || lc === '.reiniciar';

  if (isOffCmd || isOnCmd || isRestartCmd) {
    if (!canControl) {
      await message.reply('❌ Solo owner/manager/admin pueden usar este comando.');
      return;
    }
    if (isOffCmd) {
      ownerAway = true;
      await message.reply(
        [
          '🇪🇸 **Modo descanso activado.** Está descansando o no conectado; responderá cuando pueda.',
          '',
          '🇺🇸 **Rest mode activated.** He is unavailable; he will reply when possible.',
        ].join('\n'),
      );
      await logOwnerState(message.guild, message.member, true).catch(() => {});
      return;
    }
    if (isOnCmd) {
      ownerAway = false;
      await message.reply(
        [
          '🇪🇸 **Modo conectado activado.** Está disponible y responderá cuando pueda.',
          '',
          '🇺🇸 **Connected mode activated.** He is online and will reply when he can.',
        ].join('\n'),
      );
      await logOwnerState(message.guild, message.member, false).catch(() => {});
      return;
    }
    if (isRestartCmd) {
      try {
        await message.reply('♻️ Reiniciando el bot…');
        await logAction(message.member, 'Restart', null, 'Reinicio solicitado').catch(() => {});
        await client.destroy();
      } finally {
        setTimeout(() => process.exit(0), 500);
      }
      return;
    }
  }

  /* ---- !helpmoros ---- */
  if (content === '!helpmoros') {
    await message.channel.send({ embeds: [buildStaffHelpEmbed(PREFIX)] });
    return;
  }

  /* ---- .announcements ---- */
  if (lc.startsWith('.announcements')) {
    if (!hasStaffPermission(message.member)) {
      await message.reply('❌ Solo personal autorizado puede usar `.announcements`.')
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 4000));
      return;
    }
    await message.delete().catch(() => {});
    const announcement = content.slice('.announcements'.length).trim();
    if (!announcement) {
      await message.channel
        .send('⚠️ Escribe el anuncio tras el comando. Ej: `.announcements Mantenimiento 22:00`')
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('📢 Anuncio Importante')
      .setDescription(announcement)
      .setFooter({
        text: `Anuncio enviado por ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL(),
      })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return;
  }

  /* ---- .wipe ---- */
  if (lc.startsWith('.wipe')) {
    if (!hasStaffPermission(message.member)) {
      await message.reply('❌ Solo personal autorizado puede usar `.wipe`.')
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 4000));
      return;
    }
    await message.delete().catch(() => {});
    const wipeText = content.slice('.wipe'.length).trim();
    if (!wipeText) {
      await message.channel
        .send('⚠️ Escribe el texto del wipe. Ej: `.wipe Día 10/11/25 Moros Clan`')
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0xA020F0)
      .setTitle('💥 Wipe Confirmado')
      .setDescription(wipeText)
      .setImage(
        'https://cdn.discordapp.com/attachments/1396472334814150758/1437139997051457616/Moros_Squad.webp?ex=6912d12c&is=69117fac&hm=96d9b5b5776bad422213abc9190c02b6ecdd4a4543fbabe6aa4adbbb73c6b48a&',
      )
      .setFooter({
        text: `Anuncio enviado por ${message.author.tag}`,
        iconURL: message.author.displayAvatarURL(),
      })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return;
  }

  /* ---- .tos 🇪🇸 / 🇺🇸 ---- */
  if (lc === '.tos🇪🇸') {
    const embed = new EmbedBuilder()
      .setTitle('📜 Normas del Servidor 🇪🇸')
      .setDescription(
        [
          '1️⃣ **Respeto ante todo.**',
          '2️⃣ **Nada de spam ni lenguaje ofensivo.**',
          '3️⃣ **Evita conflictos; contacta con staff si hay problema.**',
          '4️⃣ **Disfruta y aporta positividad.**',
        ].join('\n'),
      )
      .setColor('Green')
      .setFooter({ text: 'Al permanecer aceptas cumplir estas normas.' })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
    return;
  }
  if (lc === '.tos🇺🇸') {
    const embed = new EmbedBuilder()
      .setTitle('📜 Server Rules 🇺🇸')
      .setDescription(
        [
          '1️⃣ **Respect everyone.**',
          '2️⃣ **No spam or offensive language.**',
          '3️⃣ **Avoid conflicts; contact staff if needed.**',
          '4️⃣ **Have fun and be positive.**',
        ].join('\n'),
      )
      .setColor('Blue')
      .setFooter({ text: 'By staying, you agree to follow these rules.' })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
    return;
  }

  /* ---- .staff (solo en canal designado) ---- */
  if (lc === '.staff') {
    if (!STAFF_INFO_CHANNEL_ID || message.channel.id !== STAFF_INFO_CHANNEL_ID) return;
    await message.reply({ embeds: [buildStaffHelpEmbed(PREFIX)] });
    await logAction(message.member, 'Mostró .staff', null, `Canal: #${message.channel.name}`).catch(()=>{});
    return;
  }

  /* ---- Diversión/Utilidad simples ---- */

  // .love
  if (lc.startsWith('.love')) {
    const args = content.split(' ').slice(1);
    const target = args.join(' ');
    if (!target) {
      await message.reply('❤️ ¿Con quién? Ejemplo: `.love @usuario`');
      return;
    }
    const percent = Math.floor(Math.random() * 101);
    const frases = [
      '💞 Están hechos el uno para el otro 💞',
      '💔 Mejor amigos... nada más 💔',
      '🔥 Química peligrosa 🔥',
      '😅 No pinta bien...',
      '❤️ Cupido aprueba esta unión ❤️',
    ];
    const frase = frases[Math.floor(Math.random() * frases.length)];
    await message.reply(`💘 El amor entre tú y **${target}** es de **${percent}%**\n${frase}`);
    return;
  }

  // .clear 10
  if (lc.startsWith('.clear')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await message.reply('❌ No tienes permiso para usar `.clear`.');
      return;
    }
    const cantidad = parseInt(content.split(' ')[1]) || 10;
    if (isNaN(cantidad) || cantidad < 1 || cantidad > 100) {
      await message.reply('⚠️ Usa un número entre 1 y 100. Ejemplo: `.clear 10`');
      return;
    }
    await message.channel.bulkDelete(cantidad + 1, true).catch(() => {});
    const confirm = await message.channel.send(`🧹 Borrados **${cantidad}** mensajes.`);
    setTimeout(() => confirm.delete().catch(() => {}), 3000);
    return;
  }

  // .p (3–24)
  if (lc === '.p') {
    const random = Math.floor(Math.random() * (24 - 3 + 1)) + 3;
    await message.reply(`🎯 Tu número aleatorio es: **${random}**`);
    return;
  }

  /* ---- Prefijo staff (solo en canal STAFF_CHANNEL_ID) ---- */
  if (!content.startsWith(PREFIX)) return;
  if (message.channel.id !== STAFF_CHANNEL_ID) return;

  const args = content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  if (!hasStaffPermission(message.member)) {
    await message.reply('❌ No tienes permisos para usar comandos de staff.');
    return;
  }

  const targetMember =
    message.mentions.members?.first() ||
    (args[0] &&
      (await message.guild.members
        .fetch(args[0].replace(/[<@!>]/g, ''))
        .catch(() => null)));

  try {
    if (cmd === 'ban') {
      if (!targetMember) return message.reply('Uso: `!ban @usuario [razón]`');
      const reason = args.slice(1).join(' ') || `Baneado por ${message.author.tag}`;
      if (!targetMember.bannable) return message.reply('❌ No puedo banear a ese usuario.');
      await targetMember.ban({ reason });
      await message.reply(`🔨 **${targetMember.user.tag}** baneado. Razón: ${reason}`);
      await logAction(message.member, 'Ban', targetMember, reason);
      return;
    }

    if (cmd === 'kick') {
      if (!targetMember) return message.reply('Uso: `!kick @usuario [razón]`');
      const reason = args.slice(1).join(' ') || `Expulsado por ${message.author.tag}`;
      if (!targetMember.kickable) return message.reply('❌ No puedo expulsar a ese usuario.');
      await targetMember.kick(reason);
      await message.reply(`👢 **${targetMember.user.tag}** expulsado. Razón: ${reason}`);
      await logAction(message.member, 'Kick', targetMember, reason);
      return;
    }

    if (cmd === 'timeout') {
      if (!targetMember) return message.reply('Uso: `!timeout @usuario 10m [razón]`');
      const durationMs = parseDuration(args[1]);
      if (!durationMs) return message.reply('⏳ Duración inválida. Usa s/m/h/d (ej: 10m, 2h).');
      const reason = args.slice(2).join(' ') || `Timeout por ${message.author.tag}`;
      if (!targetMember.moderatable) return message.reply('❌ No puedo poner timeout a ese usuario.');
      await targetMember.timeout(durationMs, reason);
      await message.reply(`⏱️ **${targetMember.user.tag}** en timeout durante ${args[1]}. Razón: ${reason}`);
      await logAction(message.member, `Timeout (${args[1]})`, targetMember, reason);
      return;
    }

    if (cmd === 'alert') {
      const msg = args.slice(targetMember ? 1 : 0).join(' ') || '(sin mensaje)';
      const alertCh = ALERTS_CHANNEL_ID && message.guild.channels.cache.get(ALERTS_CHANNEL_ID);

      const embed = new EmbedBuilder()
        .setTitle('📢 Alerta del Staff')
        .setDescription(`${targetMember ? `Usuario: <@${targetMember.id}>\n` : ''}Mensaje: ${msg}`)
        .setFooter({ text: `Por ${message.author.tag}` })
        .setTimestamp();

      if (alertCh?.isTextBased()) {
        await alertCh.send({ embeds: [embed] });
        await message.reply('✅ Alerta enviada.');
        await logAction(message.member, 'Alerta', targetMember, msg);
      } else {
        await message.reply('⚠️ Configura `ALERTS_CHANNEL_ID` para usar `!alert`.');
      }
      return;
    }

    if (cmd === 'help' || cmd === 'helpmoros') {
      await message.reply({ embeds: [buildStaffHelpEmbed(PREFIX)] });
      return;
    }
  } catch (err) {
    console.error(err);
    await message.reply('❌ Ocurrió un error ejecutando el comando.');
  }
});

/* ==== Slash /alert ==== */
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'alert') return;

    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const hasPerm =
      member.permissions?.has(PermissionsBitField.Flags.ModerateMembers) ||
      member.permissions?.has(PermissionsBitField.Flags.ManageMessages) ||
      (STAFF_ROLE_ID && member.roles?.cache?.has(STAFF_ROLE_ID)) ||
      managerRoles.some((r) => member.roles?.cache?.has(r));

    if (!hasPerm) {
      return interaction.editReply('❌ No tienes permiso para usar este comando.');
    }

    const canal = interaction.options.getChannel('canal');
    const mensaje = interaction.options.getString('mensaje');

    if (!canal || !canal.isTextBased()) {
      return interaction.editReply('⚠️ Ese canal no es válido o no es de texto.');
    }

    const me = interaction.guild.members.me;
    const canSend = canal.permissionsFor(me)?.has([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
    ]);
    if (!canSend) {
      return interaction.editReply('⚠️ No tengo permisos para enviar mensajes en ese canal.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📢 Alerta del Staff')
      .setDescription(mensaje)
      .setFooter({ text: `Enviado por ${member.user.tag}` })
      .setTimestamp();

    await canal.send({ embeds: [embed] });
    await interaction.editReply(`✅ Mensaje enviado a ${canal}`);
    await logAction(member, '/alert', null, `Canal: #${canal.name} | Msg: ${mensaje}`).catch(()=>{});
  } catch (err) {
    console.error('Slash /alert error:', err);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply('❌ Ocurrió un error con /alert.');
    }
  }
});

/* ==== Healthcheck 24/7 ==== */
const app = express();
app.get(PING_PATH, (_req, res) => res.send('OK ✅ Bot activo'));
app.use((_req, res) => res.sendStatus(404));
app.listen(3000, () => console.log(`🌐 Servidor web activo en ${PING_PATH}`));

/* ==== Login ==== */
client.login(process.env.DISCORD_TOKEN);
