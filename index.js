// index.js — MOROS BOT • Full + Música + AntiSpam/AntiRaid + Juegos + Encuestas (2025-11-12)
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const express = require('express');

/* ====== IMPORTS MÚSICA ====== */
const {
  joinVoiceChannel,
  createAudioPlayer,
  NoSubscriberBehavior,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection,
} = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const yts = require('yt-search');

/* =============== CLIENT & INTENTS =============== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel],
});

/* =============== ENV VARS =============== */
const PREFIX = process.env.PREFIX || '!';
const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID;
const ALERTS_CHANNEL_ID = process.env.ALERTS_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const MANAGER_ROLE_ID = process.env.MANAGER_ROLE_ID;
const WELCOME_BANNER = process.env.WELCOME_BANNER || 'https://i.imgur.com/qKkT3zD.png';
const PING_PATH = process.env.PING_PATH || '/ping';

/* =============== HELPERS =============== */
const guildLang = new Map(); // { guildId: 'es'|'en' }
const balances = new Map();  // { userId: number } para slots/coinflip
const startTime = Date.now();

function t(guildId, es, en) {
  const lang = guildLang.get(guildId) || 'es';
  return lang === 'en' ? en : es;
}

function hasStaffPermission(member) {
  if (!member) return false;
  return (
    member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
    member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
    (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID)) ||
    (MANAGER_ROLE_ID && member.roles.cache.has(MANAGER_ROLE_ID)) ||
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

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

let caseCounter = 1;
function createLogEmbed({ staff, action, target, reason }) {
  const unix = Math.floor(Date.now() / 1000);
  const caseId = String(caseCounter++).padStart(4, '0');
  return new EmbedBuilder()
    .setTitle(`🧾 Registro · Caso #${caseId}`)
    .addFields(
      { name: '👤 Staff', value: staff ? `${staff.user.tag} (${staff.id})` : 'Sistema' },
      { name: '🎯 Usuario', value: target ? `${target.user.tag} (${target.id})` : 'N/A' },
      { name: '⚙️ Acción', value: action, inline: true },
      { name: '📝 Detalle', value: reason || '—', inline: true },
      { name: '⏰ Hora', value: `<t:${unix}:F> • <t:${unix}:R>` },
    )
    .setTimestamp()
    .setColor('Orange');
}

async function logToChannel(guild, embed) {
  try {
    if (!LOG_CHANNEL_ID || !guild) return;
    const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch {}
}

function buildHelpEmbed(gid) {
  return new EmbedBuilder()
    .setTitle('🧭 Comandos - MOROS BOT')
    .setColor('Blue')
    .setDescription(
      [
        '**Texto / anuncios:**',
        '`.announcements <texto>`',
        '`.wipe <texto>` (con imagen Moros)',
        '`.raidroles <texto>`',
        '`.wiperoles <texto>`',
        '`.code <texto>`',
        '`.steam <texto>`',
        '`.embed <título> | <descripción>`',
        '',
        '**Música:**',
        '`.play <link o nombre>` · `.queue` · `.skip` · `.pause` · `.resume` · `.stop`',
        '',
        '**Utilidad y social:**',
        '`.serverstats` · `.uptime` · `.p`',
        '`.love @usuario` · `.meme`',
        '`.poll Pregunta | Opción1 | Opción2 | ...`',
        '`.slots` · `.coinflip cara|cruz`',
        '`.setlang es` / `.setlang en`',
        '`.morosinfo`',
        '',
        '**Limpieza:**',
        '`.clear 10`',
        '',
        '**Owner / Managers:** `.off` `.onn` `.reiniciar`',
        '',
        '**Staff (usar en canal staff):**',
        '`!ban @usuario [razón]` · `!kick @usuario [razón]` · `!timeout @usuario 10m [razón]` · `!alert @usuario [msg]`',
      ].join('\n'),
    )
    .setFooter({ text: t(gid, 'Moros Squad | Sistema de Staff', 'Moros Squad | Staff System') })
    .setTimestamp();
}

/* =============== MÚSICA =============== */
const music = new Map(); // guildId -> { connection, player, queue: [Track], textChannelId, voiceChannelId, playing }

class Track {
  constructor({ title, url, requestedBy }) {
    this.title = title;
    this.url = url;
    this.requestedBy = requestedBy;
  }
}

async function searchYouTube(query) {
  if (ytdl.validateURL(query)) {
    const info = await ytdl.getInfo(query);
    return new Track({
      title: info.videoDetails.title,
      url: info.videoDetails.video_url,
      requestedBy: null,
    });
  } else {
    const res = await yts(query);
    const v = res.videos && res.videos.length ? res.videos[0] : null;
    if (!v) return null;
    return new Track({
      title: v.title,
      url: v.url,
      requestedBy: null,
    });
  }
}

function connectVoice(guild, voiceChannel) {
  let data = music.get(guild.id);
  if (data?.connection) return data.connection;

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  if (!data) {
    data = { connection, player: null, queue: [], textChannelId: null, voiceChannelId: voiceChannel.id, playing: false };
    music.set(guild.id, data);
  } else {
    data.connection = connection;
    data.voiceChannelId = voiceChannel.id;
  }

  return connection;
}

function getOrCreatePlayer(guild) {
  let data = music.get(guild.id);
  if (!data) {
    data = { connection: null, player: null, queue: [], textChannelId: null, voiceChannelId: null, playing: false };
    music.set(guild.id, data);
  }
  if (!data.player) {
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    player.on('stateChange', (oldState, newState) => {
      if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
        data.playing = false;
        playNext(guild).catch(() => {});
      }
    });
    player.on('error', (e) => {
      console.error('Player error:', e);
      data.playing = false;
      playNext(guild).catch(() => {});
    });
    data.player = player;
  }
  return data.player;
}

async function playNext(guild) {
  const data = music.get(guild.id);
  if (!data || !data.connection || !data.player) return;
  if (!data.queue.length) {
    data.playing = false;
    return;
  }

  const track = data.queue.shift();
  try {
    const stream = ytdl(track.url, {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25,
    });
    const resource = createAudioResource(stream);
    data.player.play(resource);
    data.connection.subscribe(data.player);
    data.playing = true;

    const textCh = guild.channels.cache.get(data.textChannelId);
    if (textCh?.isTextBased()) {
      await textCh.send(`🎶 Reproduciendo: **${track.title}** ${track.requestedBy ? `(por ${track.requestedBy})` : ''}`);
    }
  } catch (err) {
    console.error('playNext error:', err);
    const textCh = guild.channels.cache.get(data.textChannelId);
    if (textCh?.isTextBased()) {
      await textCh.send('⚠️ Error reproduciendo la pista. Pasando a la siguiente…');
    }
    data.playing = false;
    return playNext(guild);
  }
}

async function handlePlayCommand(message, query) {
  const vc = message.member?.voice?.channel;
  if (!vc) {
    await message.reply('🎧 Entra a un canal de voz primero.');
    return;
  }
  await message.channel.send('🔎 Buscando…');
  const track = await searchYouTube(query);
  if (!track) {
    await message.channel.send('❌ No encontré resultados.');
    return;
  }
  track.requestedBy = message.author.tag;

  connectVoice(message.guild, vc);
  getOrCreatePlayer(message.guild);
  const data = music.get(message.guild.id);
  data.textChannelId = message.channel.id;

  data.queue.push(track);
  await message.channel.send(`➕ Añadido a la cola: **${track.title}**`);

  if (!data.playing) {
    playNext(message.guild);
  }
}

function handleSkip(message) {
  const data = music.get(message.guild.id);
  if (!data?.player) return message.reply('⏭️ No hay nada reproduciéndose.');
  data.player.stop(true);
  message.reply('⏭️ Saltado.');
}

function handlePause(message) {
  const data = music.get(message.guild.id);
  if (!data?.player) return message.reply('⏸️ No hay nada reproduciéndose.');
  data.player.pause();
  message.reply('⏸️ Pausado.');
}

function handleResume(message) {
  const data = music.get(message.guild.id);
  if (!data?.player) return message.reply('▶️ No hay nada pausado.');
  data.player.unpause();
  message.reply('▶️ Reanudado.');
}

function handleQueue(message) {
  const data = music.get(message.guild.id);
  if (!data?.queue?.length) return message.reply('📭 La cola está vacía.');
  const list = data.queue.slice(0, 10).map((t, i) => `${i + 1}. ${t.title} — solicitado por ${t.requestedBy || 'alguien'}`).join('\n');
  message.reply(`📜 **Cola (siguientes):**\n${list}`);
}

function handleStop(message) {
  const data = music.get(message.guild.id);
  if (!data) return message.reply('⏹️ No hay nada que parar.');
  data.queue = [];
  data.playing = false;
  try { data.player?.stop(true); } catch {}
  try { getVoiceConnection(message.guild.id)?.destroy(); } catch {}
  music.delete(message.guild.id);
  message.reply('⏹️ Música detenida y desconectado del canal.');
}

/* =============== READY =============== */
client.once('ready', () => {
  console.log(`✅ Conectado como ${client.user.tag}`);
});

/* =============== BIENVENIDA & ANTI-RAID =============== */
const joinBuckets = new Map();

client.on('guildMemberAdd', async (member) => {
  try {
    const ch = WELCOME_CHANNEL_ID && member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (ch?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle('👋 ¡Bienvenid@ al servidor!')
        .setDescription(`Hola ${member}, disfruta del servidor y respeta a los demás.`)
        .setImage(WELCOME_BANNER)
        .setColor('Blurple')
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setTimestamp();
      await ch.send({ content: `${member}`, embeds: [embed] });
    }

    const now = Date.now();
    const arr = joinBuckets.get(member.guild.id) || [];
    arr.push(now);
    const filtered = arr.filter(t => now - t <= 20_000);
    joinBuckets.set(member.guild.id, filtered);
    if (filtered.length >= 5) {
      await logToChannel(member.guild, createLogEmbed({
        staff: null,
        action: 'AntiRaid — Posible oleada de entradas',
        target: member,
        reason: `Entradas en 20s: ${filtered.length}.`,
      }));
    }
  } catch (e) { console.error('guildMemberAdd error:', e); }
});

/* =============== LOGS AVANZADOS =============== */
client.on('messageDelete', async (msg) => {
  if (!msg.guild || msg.author?.bot) return;
  await logToChannel(msg.guild, createLogEmbed({
    staff: null,
    action: 'Mensaje borrado',
    target: msg.member,
    reason: `Canal: #${msg.channel?.name}\nAutor: ${msg.author?.tag}\nContenido: ${msg.content?.slice(0, 900) || '(embed/adjunto)'}`,
  }));
});

client.on('messageUpdate', async (_old, msg) => {
  if (!msg.guild || msg.author?.bot) return;
  await logToChannel(msg.guild, createLogEmbed({
    staff: null,
    action: 'Mensaje editado',
    target: msg.member,
    reason: `Canal: #${msg.channel?.name}\nAutor: ${msg.author?.tag}\nNuevo contenido: ${msg.content?.slice(0, 900) || '(embed/adjunto)'}`,
  }));
});

/* =============== ANTI-SPAM =============== */
const spamBuckets = new Map(); // { guildId:userId -> {times: number[]} }

async function handleSpam(message) {
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const entry = spamBuckets.get(key) || { times: [] };
  entry.times.push(now);
  entry.times = entry.times.filter(t => now - t <= 5_000); // ventana 5s
  spamBuckets.set(key, entry);

  if (entry.times.length >= 7) { // 7 msgs/5s => timeout 10m
    if (message.member?.moderatable) {
      const ms = 10 * 60 * 1000;
      await message.member.timeout(ms, 'Anti-Spam: 7+ mensajes en 5s').catch(()=>{});
      await logToChannel(message.guild, createLogEmbed({
        staff: null,
        action: 'AntiSpam — Timeout aplicado',
        target: message.member,
        reason: `Usuario envió ${entry.times.length} mensajes en 5s.`,
      }));
    }
    spamBuckets.set(key, { times: [] });
  }
}

/* =============== MENSAJES =============== */
let ownerAway = false;

client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    const content = message.content?.trim() ?? '';
    const lc = content.toLowerCase();

    if (!lc.startsWith(PREFIX)) handleSpam(message);

    if (lc === '!helpmoros') {
      await message.channel.send({ embeds: [buildHelpEmbed(message.guild.id)] });
      return;
    }

    const isOwner = message.author.id === OWNER_ID;
    const isManager = MANAGER_ROLE_ID && message.member.roles.cache.has(MANAGER_ROLE_ID);
    const canControl = isOwner || isManager || message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    if (['.off', '.onn', '.reiniciar'].includes(lc)) {
      if (!canControl) { await message.reply('❌ Solo owner/manager/admin.'); return; }
      if (lc === '.off') {
        ownerAway = true;
        await message.reply('💤 Owner en modo descanso.');
        await logToChannel(message.guild, createLogEmbed({ staff: message.member, action: 'Owner OFF', target: null, reason: '' }));
        return;
      }
      if (lc === '.onn') {
        ownerAway = false;
        await message.reply('✅ Owner conectado.');
        await logToChannel(message.guild, createLogEmbed({ staff: message.member, action: 'Owner ONN', target: null, reason: '' }));
        return;
      }
      if (lc === '.reiniciar') {
        await message.reply('♻️ Reiniciando el bot…');
        setTimeout(() => process.exit(0), 800);
        return;
      }
    }

    if (ownerAway && message.mentions.users.has(OWNER_ID)) {
      await message.reply('🛌 Está descansando; responderá cuando pueda.');
    }

    /* ---------- MÚSICA ---------- */
    if (lc.startsWith('.play ')) {
      const query = content.slice('.play'.length).trim();
      if (!query) return message.reply('👉 Usa: `.play <enlace o nombre>`');
      await handlePlayCommand(message, query);
      return;
    }
    if (lc === '.skip') { handleSkip(message); return; }
    if (lc === '.pause') { handlePause(message); return; }
    if (lc === '.resume') { handleResume(message); return; }
    if (lc === '.queue') { handleQueue(message); return; }
    if (lc === '.stop') { handleStop(message); return; }

    /* ---------- Anuncios / Textos ---------- */
    const sendSimpleEmbed = async (title, description, color = 'Aqua') => {
      const embed = new EmbedBuilder()
        .setTitle(title).setDescription(description)
        .setColor(color)
        .setFooter({ text: `Publicado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
    };

    if (lc.startsWith('.announcements')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const body = content.slice('.announcements'.length).trim() || 'Anuncio del servidor.';
      await sendSimpleEmbed('📢 Anuncio Importante', body, 0xFFD700);
      return;
    }

    if (lc.startsWith('.wipe')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const body = content.slice('.wipe'.length).trim() || 'Nuevo wipe confirmado.';
      const embed = new EmbedBuilder()
        .setTitle('💥 Wipe Confirmado')
        .setDescription(body)
        .setImage('https://cdn.discordapp.com/attachments/1396472334814150758/1437139997051457616/Moros_Squad.webp')
        .setColor(0xA020F0)
        .setFooter({ text: `Publicado por ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (lc.startsWith('.raidroles')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const body = content.slice('.raidroles'.length).trim() || 'Reacciona con ✅ para unirte a la raid.';
      await sendSimpleEmbed('🚨 Raid Roles', body, 0xFF3B30);
      return;
    }

    if (lc.startsWith('.wiperoles')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const body = content.slice('.wiperoles'.length).trim() || 'Reacciona para recibir el rol de wipe.';
      await sendSimpleEmbed('🧹 Wipe Roles', body, 0x34C759);
      return;
    }

    if (lc.startsWith('.code')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const body = content.slice('.code'.length).trim() || 'Código disponible.';
      await sendSimpleEmbed('🧩 CODE / CÓDIGO', body, 0x00AEEF);
      return;
    }

    if (lc.startsWith('.steam')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const body = content.slice('.steam'.length).trim() || 'Únete a nuestro grupo de Steam.';
      await sendSimpleEmbed('🔥 STEAM', body, 0x1B2838);
      return;
    }

    if (lc.startsWith('.embed')) {
      if (!hasStaffPermission(message.member)) return;
      await message.delete().catch(()=>{});
      const raw = content.slice('.embed'.length).trim();
      const [title, desc] = raw.split('|').map(s => (s || '').trim());
      if (!title || !desc) {
        await message.channel.send('⚠️ Uso: `.embed Título | Descripción`');
        return;
      }
      await sendSimpleEmbed(title, desc, 0x5865F2);
      return;
    }

    /* ---------- Utilidad ---------- */
    if (lc === '.serverstats') {
      const g = message.guild;
      const members = g.memberCount;
      const bots = g.members.cache.filter(m => m.user.bot).size;
      const humans = members - bots;
      const roles = g.roles.cache.size;
      const embed = new EmbedBuilder()
        .setTitle(`📊 Estadísticas de ${g.name}`)
        .addFields(
          { name: '👥 Miembros', value: `Total: ${members}\nHumanos: ${humans}\nBots: ${bots}`, inline: true },
          { name: '🧩 Roles', value: `${roles}`, inline: true },
        )
        .setColor('Aqua')
        .setThumbnail(g.iconURL({ size: 256 }))
        .setTimestamp();
      await message.reply({ embeds: [embed] });
      return;
    }

    if (lc === '.uptime') {
      const ms = Date.now() - startTime;
      await message.reply(`⏱️ Uptime: **${formatUptime(ms)}**`);
      return;
    }

    if (lc.startsWith('.setlang')) {
      if (!hasStaffPermission(message.member)) return;
      const arg = content.split(/\s+/)[1];
      if (!['es','en'].includes(arg || '')) {
        await message.reply('🌐 Usa `.setlang es` o `.setlang en`');
        return;
      }
      guildLang.set(message.guild.id, arg);
      await message.reply(arg === 'en' ? '✅ Language set to **English**.' : '✅ Idioma cambiado a **español**.');
      return;
    }

    if (lc === '.morosinfo') {
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Moros Clan — Info')
        .setDescription(
          [
            '• Servidor oficial del clan **Moros**.',
            '• Eventos de raid, wipes y roles dedicados.',
            '• Respeto y juego en equipo por encima de todo.',
          ].join('\n'),
        )
        .setColor(0x9B59B6)
        .setThumbnail(message.guild.iconURL({ size: 256 }))
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
      return;
    }

    /* ---------- Social / Juegos ---------- */
    if (lc === '.meme') {
      const memes = [
        'https://i.imgur.com/w3duR07.png',
        'https://i.imgur.com/fWj4p9D.jpeg',
        'https://i.imgur.com/MvL1fRj.png',
        'https://i.imgur.com/2WZtOdR.jpeg',
      ];
      const url = memes[Math.floor(Math.random() * memes.length)];
      const embed = new EmbedBuilder().setImage(url).setColor('Random').setTimestamp();
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (lc.startsWith('.poll')) {
      const raw = content.slice('.poll'.length).trim();
      const parts = raw.split('|').map(s => (s || '').trim()).filter(Boolean);
      if (parts.length < 2) {
        await message.reply('🗳️ Uso: `.poll Pregunta | Opción1 | Opción2 | ...`');
        return;
      }
      const question = parts.shift();
      const choices = parts.slice(0, 10);
      const nums = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      const desc = choices.map((c,i) => `${nums[i]} ${c}`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('🗳️ Encuesta')
        .setDescription(`**${question}**\n\n${desc}`)
        .setColor(0x00C7A9)
        .setFooter({ text: `Creado por ${message.author.tag}` })
        .setTimestamp();
      const msg = await message.channel.send({ embeds: [embed] });
      for (let i=0; i<choices.length; i++) await msg.react(nums[i]).catch(()=>{});
      return;
    }

    const getBal = (id) => balances.get(id) ?? 100;
    const setBal = (id, val) => balances.set(id, Math.max(0, Math.floor(val)));

    if (lc === '.slots') {
      const bet = 10;
      const icons = ['🍒','🍋','🔔','⭐','🍉','7️⃣'];
      const spin = () => icons[Math.floor(Math.random()*icons.length)];
      const a = spin(), b = spin(), c = spin();
      let bal = getBal(message.author.id) - bet;
      let result = `🎰 **[ ${a} | ${b} | ${c} ]**\n-10 monedas`;
      if (a === b && b === c) {
        bal += 100;
        result = `🎰 **[ ${a} | ${b} | ${c} ]**\n🎉 ¡Jackpot! +100 monedas`;
      } else if (a === b || b === c || a === c) {
        bal += 20;
        result = `🎰 **[ ${a} | ${b} | ${c} ]**\n✨ Doble! +20 monedas`;
      }
      setBal(message.author.id, bal);
      await message.reply(`${result}\n💰 Saldo: **${bal}**`);
      return;
    }

    if (lc.startsWith('.coinflip')) {
      const guess = (content.split(/\s+/)[1] || '').toLowerCase();
      if (!['cara','cruz'].includes(guess)) {
        await message.reply('🪙 Usa: `.coinflip cara` o `.coinflip cruz`');
        return;
      }
      let bal = getBal(message.author.id);
      const bet = 10;
      const flip = Math.random() < 0.5 ? 'cara' : 'cruz';
      let txt = `🪙 Salió **${flip}**. -10 monedas.`;
      bal -= bet;
      if (flip === guess) { bal += 25; txt = `🪙 Salió **${flip}**. ¡Ganaste! +25 monedas.`; }
      setBal(message.author.id, bal);
      await message.reply(`${txt}\n💰 Saldo: **${bal}**`);
      return;
    }

    if (lc.startsWith('.love')) {
      const args = content.split(' ').slice(1);
      const target = args.join(' ');
      if (!target) { await message.reply('❤️ ¿Con quién? Ej: `.love @usuario`'); return; }
      const percent = Math.floor(Math.random() * 101);
      const frases = ['💞 Están hechos el uno para el otro 💞','💔 Mejor amigos... nada más 💔','🔥 Química peligrosa 🔥','😅 No pinta bien...','❤️ Cupido aprueba esta unión ❤️'];
      const frase = frases[Math.floor(Math.random() * frases.length)];
      await message.reply(`💘 El amor entre tú y **${target}** es de **${percent}%**\n${frase}`);
      return;
    }

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

    if (lc === '.p') {
      const random = Math.floor(Math.random() * (24 - 3 + 1)) + 3;
      await message.reply(`🎯 Tu número aleatorio es: **${random}**`);
      return;
    }

    /* ---------- Prefijo STAFF (!...) ---------- */
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
        await logToChannel(message.guild, createLogEmbed({ staff: message.member, action: 'Ban', target: targetMember, reason }));
        return;
      }

      if (cmd === 'kick') {
        if (!targetMember) return message.reply('Uso: `!kick @usuario [razón]`');
        const reason = args.slice(1).join(' ') || `Expulsado por ${message.author.tag}`;
        if (!targetMember.kickable) return message.reply('❌ No puedo expulsar a ese usuario.');
        await targetMember.kick(reason);
        await message.reply(`👢 **${targetMember.user.tag}** expulsado. Razón: ${reason}`);
        await logToChannel(message.guild, createLogEmbed({ staff: message.member, action: 'Kick', target: targetMember, reason }));
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
        await logToChannel(message.guild, createLogEmbed({ staff: message.member, action: `Timeout (${args[1]})`, target: targetMember, reason }));
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
          await logToChannel(message.guild, createLogEmbed({ staff: message.member, action: 'Alerta', target: targetMember, reason: msg }));
        } else {
          await message.reply('⚠️ Configura `ALERTS_CHANNEL_ID` para usar `!alert`.');
        }
        return;
      }

      if (cmd === 'help' || cmd === 'helpmoros') {
        await message.reply({ embeds: [buildHelpEmbed(message.guild.id)] });
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

/* =============== MINI WEB 24/7 =============== */
const app = express();
app.get(PING_PATH, (_req, res) => res.send('✅ Bot activo y en línea.'));
app.use((_req, res) => res.sendStatus(404));
app.listen(3000, () => console.log(`🌐 Servidor web activo en ${PING_PATH}`));

/* =============== LOGIN =============== */
client.login(process.env.DISCORD_TOKEN);
