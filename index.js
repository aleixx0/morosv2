// index.js — MOROS BOT • Refactor estable (2025-11-11)
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');

/* ===================== CLIENT & INTENTS ===================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // NECESARIO para leer mensajes (!helpmoros / .comandos)
  ],
  partials: [Partials.Channel],
});

/* ===================== ENV VARS ===================== */
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
  .split(',').map(s => s.trim()).filter(Boolean);

const ALLOWED_GUILDS = (process.env.ALLOWED_GUILDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

/* ===================== HELPERS ===================== */
function hasStaffPermission(member) {
  if (!member) return false;
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
  try {
    if (!LOG_CHANNEL_ID) return;
    const ch = staff.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (ch?.isTextBased()) await ch.send({ embeds: [createLogEmbed({ staff, action, target, reason })] });
  } catch {}
}

async function logOwnerState(guild, staffMember, isOff) {
  try {
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
  } catch {}
}

function buildStaffHelpEmbed(prefix = PREFIX) {
  return new EmbedBuilder()
    .setTitle('🧭 Comandos - MOROS BOT')
    .setDescription(
      [
        '**TEXTO:**',
        '`.announcements <texto>` — anuncio',
        '`.wipe <texto>` — anuncio con imagen Moros',
        '`.raidroles <texto>` — roles de raid',
        '`.wiperoles <texto>` — roles de wipe',
        '`.code <texto>` — anuncio CODE',
        '`.steam <texto>` — anuncio STEAM',
        '`.serverstats` — estadísticas',
        '`.love @usuario` — test de amor',
        '`.clear 10` — limpia mensajes',
        '`.p` — número aleatorio (3–24)',
        '',
        '**STAFF (solo en canal staff):**',
        `\`${prefix}ban @usuario [razón]\` • \`${prefix}kick @usuario [razón]\` • \`${prefix}timeout @usuario 10m [razón]\` • \`${prefix}alert @usuario [msg]\``,
        '',
        '**OWNER/MANAGERS:** `.off` `.onn` `.reiniciar`',
      ].join('\n'),
    )
    .setFooter({ text: 'Moros Squad | Sistema de Staff' })
    .setColor('Blue')
    .setTimestamp();
}

/* ===================== READY & GUARD ===================== */
client.once('ready', () => {
  console.log(`✅ Conectado como ${client.user.tag}`);
  if (ALLOWED_GUILDS.length) {
    client.guilds.cache.forEach(g => {
      if (!ALLOWED_GUILDS.includes(g.id)) g.leave().catch(() => {});
    });
  }
});

client.on('guildCreate', guild => {
  if (ALLOWED_GUILDS.length && !ALLOWED_GUILDS.includes(guild.id)) {
    guild.leave().catch(() => {});
  }
});

/* ===================== BIENVENIDA ===================== */
client.on('guildMemberAdd', async (member) => {
  try {
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

    await ch.send({ content: `${member}`, embeds: [embed] });
  } catch (e) { console.error('welcome error:', e); }
});

/* ===================== MENSAJES (TEXTO) ===================== */
let ownerAway = false;
const mentionCooldown = new Set();
const setCooldown = (key, ms = 30_000) => {
  mentionCooldown.add(key);
  setTimeout(() => mentionCooldown.delete(key), ms);
};

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    if (!message.channel?.isTextBased?.() || !message.channel.isTextBased()) return;

    const content = message.content?.trim() ?? '';
    const lc = content.toLowerCase();

    /* ---- !helpmoros SIEMPRE RESPONDE, EN CUALQUIER CANAL ---- */
    if (lc === '!helpmoros') {
      await message.channel.send({ embeds: [buildStaffHelpEmbed(PREFIX)] });
      return;
    }

    /* ---- Auto-respuesta si mencionan al owner estando OFF ---- */
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

    /* ---- OWNER / MANAGERS: .off / .onn / .reiniciar ---- */
    const isOwner = OWNER_ID && message.author.id === OWNER_ID;
    const isManager = managerRoles.some(r => message.member.roles.cache.has(r));
    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const canControl = isOwner || isManager || isAdmin;

    if (['.off', '.descanso'].includes(lc) || ['.onn', '.on', '.online'].includes(lc) || ['.restart', '.reiniciar'].includes(lc)) {
      if (!canControl) {
        await message.reply('❌ Solo owner/manager/admin pueden usar estos comandos.');
        return;
      }
      if (['.off', '.descanso'].includes(lc)) {
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
        ownerAway = false;
        await message.reply([
          '🇪🇸 **Modo conectado activado.** Está disponible y responderá cuando pueda.',
          '',
          '🇺🇸 **Connected mode activated.** He is online and will reply soon.',
        ].join('\n'));
        await logOwnerState(message.guild, message.member, false);
        return;
      }
      if (['.restart', '.reiniciar'].includes(lc)) {
        try {
          await message.reply('♻️ Reiniciando el bot…');
          await logAction(message.member, 'Restart', null, 'Reinicio solicitado');
          await client.destroy();
        } finally {
          setTimeout(() => process.exit(0), 500);
        }
        return;
      }
    }

    /* ----------------- COMANDOS DE TEXTO ----------------- */

    // .announcements
    if (lc.startsWith('.announcements')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const body = content.slice('.announcements'.length).trim();
      if (!body) {
        await message.channel.send('⚠️ Escribe el anuncio. Ej: `.announcements Mantenimiento 22:00`')
          .then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle('📢 Anuncio Importante')
        .setDescription(body)
        .setColor(0xFFD700)
        .setFooter({ text: `Enviado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // .wipe
    if (lc.startsWith('.wipe')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const body = content.slice('.wipe'.length).trim();
      if (!body) {
        await message.channel.send('⚠️ Escribe el texto. Ej: `.wipe Día 10/11/25 Moros Clan`')
          .then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle('💥 Wipe Confirmado')
        .setDescription(body)
        .setImage('https://cdn.discordapp.com/attachments/1396472334814150758/1437139997051457616/Moros_Squad.webp?ex=6912d12c&is=69117fac&hm=96d9b5b5776bad422213abc9190c02b6ecdd4a4543fbabe6aa4adbbb73c6b48a&')
        .setColor(0xA020F0)
        .setFooter({ text: `Enviado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // .raidroles
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

    // .wiperoles
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

    // .code
    if (lc.startsWith('.code')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const body = content.slice('.code'.length).trim();
      if (!body) {
        await message.channel.send('⚠️ Escribe el texto. Ej: `.code Código MOROS-2025 | Reacciona para recibirlo`')
          .then(m => setTimeout(() => m.delete().catch(()=>{}), 4000));
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

    // .steam
    if (lc.startsWith('.steam')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const body = content.slice('.steam'.length).trim();
      const embed = new EmbedBuilder()
        .setTitle('🔥 STEAM')
        .setDescription(body || 'Únete al grupo de Steam y reacciona con 🔥.')
        .setColor(0x1B2838)
        .setFooter({ text: `Enviado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // .serverstats
    if (lc === '.serverstats') {
      const g = message.guild;
      const text = g.channels.cache.filter(c => [0,5,15,16].includes(c.type)).size;
      const voice = g.channels.cache.filter(c => [2,13].includes(c.type)).size;
      const cats  = g.channels.cache.filter(c => c.type === 4).size;
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

    // .love
    if (lc.startsWith('.love')) {
      const args = content.split(' ').slice(1);
      const target = args.join(' ');
      if (!target) { await message.reply('❤️ ¿Con quién? Ejemplo: `.love @usuario`'); return; }
      const percent = Math.floor(Math.random() * 101);
      const frases = [
        '💞 Están hechos el uno para el otro 💞',
        '💔 Mejor amigos... nada más 💔',
        '🔥 Química peligrosa 🔥',
        '😅 No pinta bien...',
        '❤️ Cupido aprueba esta unión ❤️'
      ];
      const frase = frases[Math.floor(Math.random() * frases.length)];
      await message.reply(`💘 El amor entre tú y **${target}** es de **${percent}%**\n${frase}`);
      return;
    }

    // .clear
    if (lc.startsWith('.clear')) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await message.reply('❌ No tienes permiso para usar `.clear`.');
        return;
      }
      const cantidad = parseInt(content.split(' ')[1]) || 10;
      await message.channel.bulkDelete(cantidad + 1, true).catch(()=>{});
      const confirm = await message.channel.send(`🧹 Borrados **${cantidad}** mensajes.`);
      setTimeout(() => confirm.delete().catch(()=>{}), 3000);
      return;
    }

    // .p
    if (lc === '.p') {
      const random = Math.floor(Math.random() * (24 - 3 + 1)) + 3;
      await message.reply(`🎯 Tu número aleatorio es: **${random}**`);
      return;
    }

    /* --------------- PREFIJO STAFF (EN CANAL STAFF) --------------- */
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
      (args[0] && (await message.guild.members.fetch(args[0].replace(/[<@!>]/g, '')).catch(()=>null)));

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
      console.error('prefix cmd error:', err);
      await message.reply('❌ Ocurrió un error ejecutando el comando.');
    }
  } catch (e) {
    console.error('messageCreate error:', e);
  }
});

/* ===================== MINI WEB 24/7 ===================== */
const app = express();
app.get(PING_PATH, (_req, res) => res.send('✅ Bot activo y en línea.'));
app.use((_req, res) => res.sendStatus(404));
app.listen(3000, () => console.log(`🌐 Servidor web activo en ${PING_PATH}`));

/* ===================== LOGIN ===================== */
client.login(process.env.DISCORD_TOKEN);
