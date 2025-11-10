require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');

/* ------------ Client ------------ */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

/* ------------ Config desde Secrets ------------ */
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

/* --- Roles managers múltiples (separados por comas) --- */
const managerRoles = process.env.MANAGER_ROLE_ID
  ? process.env.MANAGER_ROLE_ID.split(',').map(id => id.trim()).filter(Boolean)
  : [];

/* --- Whitelist de servidores (opcional) --- */
const ALLOWED_GUILDS = (process.env.ALLOWED_GUILDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/* ------------ Utils ------------ */
function hasStaffPermission(member) {
  return (
    member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
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

/* --- Logs con caso incremental --- */
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
      { name: '⏰ Hora', value: `<t:${unix}:F> • <t:${unix}:R>` }
    )
    .setTimestamp();
}
async function logAction(staff, action, target, reason) {
  if (!LOG_CHANNEL_ID) return;
  const ch = staff.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!ch || !ch.isTextBased()) return;
  await ch.send({ embeds: [createLogEmbed({ staff, action, target, reason })] });
}

async function logOwnerState(guild, staffMember, state) {
  if (!LOG_CHANNEL_ID) return;
  const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!ch || !ch.isTextBased()) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('🧾 Registro • Estado Owner/Managers')
        .addFields(
          { name: 'Acción', value: state ? 'OFF' : 'ONN', inline: true },
          { name: 'Ejecutado por', value: `${staffMember.user.tag} (${staffMember.id})`, inline: true }
        )
        .setTimestamp()
    ]
  });
}

/* --- Embed ayuda staff --- */
function buildStaffHelpEmbed(prefix = PREFIX) {
  return new EmbedBuilder()
    .setTitle('ℹ️ Comandos de Staff')
    .setDescription(
      [
        `Usa estos comandos en el canal de staff (<#${STAFF_CHANNEL_ID}>).`,
        '',
        `\`${prefix}ban @usuario [razón]\`  — Banear`,
        `\`${prefix}kick @usuario [razón]\` — Expulsar`,
        `\`${prefix}timeout @usuario <30s|10m|2h|7d> [razón]\` — Timeout`,
        `\`${prefix}alert @usuario [mensaje]\` — Alerta al canal público`,
        `\`!helpmoros\` — Mostrar esta ayuda`,
        '',
        `Además (texto): \`.announcements <texto>\` y \`.wipe <texto>\``
      ].join('\n')
    )
    .setFooter({ text: 'Solo personal autorizado.' })
    .setTimestamp();
}

/* ------------ Ready ------------ */
client.once('ready', () => {
  console.log(`✅ Conectado como ${client.user.tag}`);

  if (ALLOWED_GUILDS.length) {
    client.guilds.cache.forEach(g => {
      if (!ALLOWED_GUILDS.includes(g.id)) g.leave().catch(() => {});
    });
  }
});

/* --- Si lo invitan a server no permitido, se va --- */
client.on('guildCreate', (guild) => {
  if (ALLOWED_GUILDS.length && !ALLOWED_GUILDS.includes(guild.id)) {
    guild.leave().catch(() => {});
  }
});

/* ------------ Bienvenida bilingüe ------------ */
client.on('guildMemberAdd', async (member) => {
  // Si no quieres dar bienvenida a bots:
  // if (member.user.bot) return;

  const ch = WELCOME_CHANNEL_ID && member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!ch || !ch.isTextBased()) return;

  const botName = client.user?.username || 'nuestro bot';

  const embed = new EmbedBuilder()
    .setTitle('👋 ¡Bienvenid@! / Welcome!')
    .setDescription(
      [
        '🇪🇸 **Bienvenid@ al servidor.**',
        `Hola ${member}, soy **${botName}**.`,
        'Disfruta del servidor; mantén el respeto y pasa un buen rato.',
        'Escribe `.tos🇪🇸` para ver las normas en español.',
        '',
        '🇺🇸 **Welcome to the server!**',
        `Hi ${member}, I am **${botName}**.`,
        'Enjoy your stay; please be respectful and have fun!',
        'Type `.tos🇺🇸` to read the rules in English.'
      ].join('\n')
    )
    .setColor('Blurple')
    .setImage(WELCOME_BANNER)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `${member.guild.name} • Miembro #${member.guild.memberCount}` })
    .setTimestamp();

  await ch.send({ content: `${member}`, embeds: [embed] });

  // Log bienvenida
  try {
    if (LOG_CHANNEL_ID) {
      const logCh = member.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logCh?.isTextBased()) {
        await logCh.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🧾 Registro • Nueva entrada')
              .setDescription(`Usuario: ${member} (${member.id})`)
              .setTimestamp()
          ]
        });
      }
    }
  } catch {}
});

/* ------------ Mensajes ------------ */
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

  /* --- Auto-respuesta si mencionan al owner estando OFF --- */
  if (ownerAway && message.mentions.users.has(OWNER_ID)) {
    const key = `${message.channel.id}`;
    if (!mentionCooldown.has(key)) {
      setCooldown(key);
      const reply = [
        '🇪🇸 **Está descansando o no conectado; responderá cuando pueda.**',
        '',
        '🇺🇸 **He is resting or currently unavailable; he will reply when possible.**'
      ].join('\n');
      await message.reply(reply);
    }
  }

  /* --- Comandos del OWNER y MANAGERS (.off / .onn / .restart) --- */
  const isOwner = message.author.id === OWNER_ID;
  const isManager = managerRoles.length > 0 && managerRoles.some(r => message.member.roles.cache.has(r));
  const triedOwnerCmd = lc === '.off' || lc === '.onn' || lc === '.restart' || lc === '.reiniciar';

  if (triedOwnerCmd && !(isOwner || isManager)) {
    await message.reply('❌ Este comando solo puede usarlo el **owner** o un **manager** autorizado.');
    return;
  }

  if (isOwner || isManager) {
    if (lc === '.off') {
      ownerAway = true;
      await message.reply([
        '🇪🇸 **Modo descanso activado.**\nEstá descansando o no conectado; responderá cuando pueda.',
        '',
        '🇺🇸 **Rest mode activated.**\nHe is resting or currently unavailable; he will reply when possible.'
      ].join('\n'));
      await logOwnerState(message.guild, message.member, true);
      return;
    }

    if (lc === '.onn') {
      ownerAway = false;
      await message.reply([
        '🇪🇸 **Modo conectado activado.**\nEstá disponible y responderá cuando pueda.',
        '',
        '🇺🇸 **Connected mode activated.**\nHe is online and will reply when he can.'
      ].join('\n'));
      await logOwnerState(message.guild, message.member, false);
      return;
    }

    if (lc === '.restart' || lc === '.reiniciar') {
      try {
        await message.reply('♻️ Reiniciando el bot…');
        await logAction?.(message.member, 'Restart', null, 'Reinicio solicitado por owner/manager');
        await client.destroy();
      } finally {
        setTimeout(() => process.exit(0), 500);
      }
      return;
    }
  }

  /* --- Comando !helpmoros (sustituye a !help) --- */
  if (content === '!helpmoros') {
    const helpEmbed = buildStaffHelpEmbed(PREFIX);
    await message.channel.send({ embeds: [helpEmbed] });
    return;
  }

  /* --- Comando .announcements (borra original y manda embed) --- */
  if (lc.startsWith('.announcements')) {
    // Solo staff/managers/owner para evitar abusos
    if (!hasStaffPermission(message.member)) {
      return message.reply('❌ Solo personal autorizado puede usar `.announcements`.').then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
    }

    await message.delete().catch(() => {});
    const announcement = content.slice('.announcements'.length).trim();

    if (!announcement) {
      return message.channel.send({ content: '⚠️ Escribe el anuncio tras el comando.\nEjemplo: `.announcements Mantenimiento a las 22:00.`' })
        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('📢 Anuncio Importante')
      .setDescription(announcement)
      .setFooter({ text: `Anuncio enviado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    return;
  }

  /* --- Comando .wipe (borra original y manda embed con imagen) --- */
  if (lc.startsWith('.wipe')) {
    if (!hasStaffPermission(message.member)) {
      return message.reply('❌ Solo personal autorizado puede usar `.wipe`.').then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
    }

    await message.delete().catch(() => {});
    const wipeText = content.slice('.wipe'.length).trim();

    if (!wipeText) {
      return message.channel.send({
        content: '⚠️ Escribe el texto del wipe.\nEjemplo: `.wipe Día 10/11/25 Moros Clan`'
      }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
    }

    const embed = new EmbedBuilder()
      .setColor(0xA020F0)
      .setTitle('💥 Wipe Confirmado')
      .setDescription(wipeText)
      .setImage('https://cdn.discordapp.com/attachments/1396472334814150758/1437139997051457616/Moros_Squad.webp?ex=6912d12c&is=69117fac&hm=96d9b5b5776bad422213abc9190c02b6ecdd4a4543fbabe6aa4adbbb73c6b48a&')
      .setFooter({ text: `Anuncio enviado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    return;
  }

  /* --- Comandos públicos .tos --- */
  if (lc === '.tos🇪🇸') {
    const embed = new EmbedBuilder()
      .setTitle('📜 Normas del Servidor 🇪🇸')
      .setDescription(
        [
          '1️⃣ **Respeto ante todo:** trata a todos con educación y empatía.',
          '2️⃣ **Nada de spam o lenguaje ofensivo.** Mantén las conversaciones sanas.',
          '3️⃣ **Evita conflictos.** Si hay un problema, contacta con el staff en privado.',
          '4️⃣ **Disfruta y aporta positividad.** Este espacio es para compartir juntos.'
        ].join('\n')
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
          '1️⃣ **Respect everyone:** treat all members with kindness and empathy.',
          '2️⃣ **No spam or offensive language.** Keep conversations friendly and safe.',
          '3️⃣ **Avoid conflicts.** If any issue arises, contact staff privately.',
          '4️⃣ **Have fun and stay positive!** This space is for sharing and enjoying together.'
        ].join('\n')
      )
      .setColor('Blue')
      .setFooter({ text: 'By staying, you agree to follow these rules.' })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
    return;
  }

  /* --- .staff (solo en STAFF_INFO_CHANNEL_ID) --- */
  if (lc === '.staff') {
    if (!STAFF_INFO_CHANNEL_ID || message.channel.id !== STAFF_INFO_CHANNEL_ID) return;
    const embed = buildStaffHelpEmbed(PREFIX);
    await message.reply({ embeds: [embed] });
    try { await logAction?.(message.member, 'Mostró .staff', null, `Canal: #${message.channel.name}`); } catch {}
    return;
  }

  /* --- Comandos con prefijo (staff) SOLO en STAFF_CHANNEL_ID --- */
  if (!content.startsWith(PREFIX)) return;
  if (message.channel.id !== STAFF_CHANNEL_ID) return;

  const args = content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  if (!hasStaffPermission(message.member)) {
    return message.reply('❌ No tienes permisos para usar comandos de staff.');
  }

  const targetMember =
    message.mentions.members?.first() ||
    (args[0] &&
      (await message.guild.members.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null)));

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
        await message.reply('⚠️ Configura `ALERTS_CHANNEL_ID` en Secrets para usar `!alert`.');
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

/* ------------ Slash Command /alert ------------ */
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'alert') return;

    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const hasPerm =
      member.permissions?.has(PermissionsBitField.Flags.ModerateMembers) ||
      (STAFF_ROLE_ID && member.roles?.cache?.has(STAFF_ROLE_ID)) ||
      managerRoles.some(r => member.roles?.cache?.has(r));

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

    try {
      await logAction?.(member, '/alert', null, `Canal: #${canal.name} | Msg: ${mensaje}`);
    } catch (e) {
      console.error('Log /alert error:', e);
    }
  } catch (err) {
    console.error('Slash /alert error:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Ocurrió un error con /alert.', ephemeral: true });
    } else if (interaction.deferred && !interaction.replied) {
      await interaction.editReply('❌ Ocurrió un error con /alert.');
    }
  }
});

/* ------------ Mini servidor para 24/7 (Uptime/Healthcheck) ------------ */
const app = express();
app.get(PING_PATH, (_req, res) => res.send('OK ✅ Bot activo'));
app.use((_req, res) => res.sendStatus(404));
app.listen(3000, () => console.log(`🌐 Servidor web activo en ${PING_PATH}`));

/* ------------ Login ------------ */
client.login(process.env.DISCORD_TOKEN);
