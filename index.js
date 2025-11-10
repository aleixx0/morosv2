require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
} = require("discord.js");
const express = require("express");

/* ------------ Client ------------ */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

/* ------------ Configuración desde Secrets ------------ */
const PREFIX = process.env.PREFIX || "!";
const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID;
const ALERTS_CHANNEL_ID = process.env.ALERTS_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const STAFF_INFO_CHANNEL_ID = process.env.STAFF_INFO_CHANNEL_ID;
const OWNER_ID = process.env.OWNER_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const WELCOME_BANNER =
  process.env.WELCOME_BANNER || "https://i.imgur.com/qKkT3zD.png";
const MANAGER_ROLE_ID = process.env.MANAGER_ROLE_ID;
const PING_PATH = process.env.PING_PATH || "/ping";

/* ------------ Funciones auxiliares ------------ */
function hasStaffPermission(member) {
  return (
    member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
    (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID))
  );
}

function parseDuration(str) {
  const m = /^(\d+)\s*(s|m|h|d)$/i.exec(str || "");
  if (!m) return null;
  const n = Number(m[1]);
  const mult = { s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7 }[m[2].toLowerCase()];
  return n * mult;
}

/* --- Logs --- */
async function logAction(staff, action, target, reason) {
  if (!LOG_CHANNEL_ID) return;
  const ch = staff.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!ch || !ch.isTextBased()) return;
  const unix = Math.floor(Date.now() / 1000);
  const embed = new EmbedBuilder()
    .setTitle("🧾 Registro de Moderación")
    .addFields(
      { name: "👤 Staff", value: `${staff.user.tag} (${staff.id})` },
      { name: "⚙️ Acción", value: action, inline: true },
      {
        name: "🎯 Usuario",
        value: target ? `${target.user.tag} (${target.id})` : "N/A",
        inline: true,
      },
      { name: "📝 Razón", value: reason || "No especificada", inline: true },
      { name: "⏰ Hora", value: `<t:${unix}:F>` },
    )
    .setTimestamp();
  await ch.send({ embeds: [embed] });
}

/* ------------ Ready ------------ */
client.once("ready", () => {
  console.log(`✅ Conectado como ${client.user.tag}`);
});

/* ------------ Bienvenida ------------ */
client.on("guildMemberAdd", async (member) => {
  const ch =
    WELCOME_CHANNEL_ID && member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!ch || !ch.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle("👋 ¡Bienvenid@! / Welcome!")
    .setDescription(
      [
        "🇪🇸 **Bienvenid@ al servidor.**",
        `Hola ${member}, soy **${client.user.username}**.`,
        "Disfruta del servidor; mantén el respeto y pasa un buen rato.",
        "",
        "🇺🇸 **Welcome to the server!**",
        `Hi ${member}, I am **${client.user.username}**.`,
        "Enjoy your stay; please be respectful and have fun!",
      ].join("\n"),
    )
    .setColor("Blurple")
    .setImage(WELCOME_BANNER)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({
      text: `${member.guild.name} • Miembro #${member.guild.memberCount}`,
    })
    .setTimestamp();

  await ch.send({ content: `${member}`, embeds: [embed] });
});

/* ------------ Mensajes ------------ */
let ownerAway = false;

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  // .off y .onn del Owner
  if (message.author.id === OWNER_ID) {
    if (content === ".off") {
      ownerAway = true;
      await message.reply(
        [
          "🇪🇸 **Modo descanso activado.** Está descansando o no conectado.",
          "",
          "🇺🇸 **Rest mode activated.** He is resting or unavailable.",
        ].join("\n"),
      );
      await logAction(message.member, "Owner OFF", null, "Modo descanso");
      return;
    }

    if (content === ".onn") {
      ownerAway = false;
      await message.reply(
        [
          "🇪🇸 **Modo conectado activado.** Disponible para responder.",
          "",
          "🇺🇸 **Connected mode activated.** Available to reply.",
        ].join("\n"),
      );
      await logAction(message.member, "Owner ONN", null, "Modo conectado");
      return;
    }
  }

  // Auto respuesta si está OFF
  if (ownerAway && message.mentions.users.has(OWNER_ID)) {
    await message.reply(
      [
        "🇪🇸 **El owner está descansando o no conectado; responderá cuando pueda.**",
        "",
        "🇺🇸 **The owner is resting or offline; he will reply when possible.**",
      ].join("\n"),
    );
  }

  // .tos🇪🇸 y .tos🇺🇸
  if (content === ".tos🇪🇸") {
    const embed = new EmbedBuilder()
      .setTitle("📜 Normas del Servidor 🇪🇸")
      .setDescription(
        [
          "1️⃣ **Respeto ante todo.**",
          "2️⃣ **No spam ni lenguaje ofensivo.**",
          "3️⃣ **Evita conflictos y contacta con staff.**",
          "4️⃣ **Disfruta y aporta positividad.**",
        ].join("\n"),
      )
      .setColor("Green");
    await message.reply({ embeds: [embed] });
    return;
  }

  if (content === ".tos🇺🇸") {
    const embed = new EmbedBuilder()
      .setTitle("📜 Server Rules 🇺🇸")
      .setDescription(
        [
          "1️⃣ **Respect everyone.**",
          "2️⃣ **No spam or offensive language.**",
          "3️⃣ **Avoid conflicts, contact staff privately.**",
          "4️⃣ **Have fun and stay positive!**",
        ].join("\n"),
      )
      .setColor("Blue");
    await message.reply({ embeds: [embed] });
    return;
  }

  // Comandos de staff
  if (!content.startsWith(PREFIX)) return;
  if (message.channel.id !== STAFF_CHANNEL_ID) return;

  const args = content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift();

  if (!hasStaffPermission(message.member)) {
    return message.reply("❌ No tienes permisos para usar comandos de staff.");
  }

  const targetMember =
    message.mentions.members?.first() ||
    (args[0] &&
      (await message.guild.members
        .fetch(args[0].replace(/[<@!>]/g, ""))
        .catch(() => null)));

  try {
    if (cmd === "ban") {
      if (!targetMember) return message.reply("Uso: `!ban @usuario [razón]`");
      const reason = args.slice(1).join(" ") || "Baneado por el staff";
      await targetMember.ban({ reason });
      await message.reply(`🔨 ${targetMember.user.tag} baneado.`);
      await logAction(message.member, "Ban", targetMember, reason);
      return;
    }

    if (cmd === "kick") {
      if (!targetMember) return message.reply("Uso: `!kick @usuario [razón]`");
      const reason = args.slice(1).join(" ") || "Expulsado por el staff";
      await targetMember.kick(reason);
      await message.reply(`👢 ${targetMember.user.tag} expulsado.`);
      await logAction(message.member, "Kick", targetMember, reason);
      return;
    }

    if (cmd === "timeout") {
      if (!targetMember)
        return message.reply("Uso: `!timeout @usuario 10m [razón]`");
      const duration = parseDuration(args[1]);
      if (!duration) return message.reply("⏳ Usa formato s/m/h/d (ej: 10m)");
      const reason = args.slice(2).join(" ") || "Timeout";
      await targetMember.timeout(duration, reason);
      await message.reply(`⏱️ ${targetMember.user.tag} timeout ${args[1]}`);
      await logAction(
        message.member,
        `Timeout (${args[1]})`,
        targetMember,
        reason,
      );
      return;
    }

    if (cmd === "alert") {
      const msg = args.join(" ") || "(sin mensaje)";
      const alertCh =
        ALERTS_CHANNEL_ID &&
        message.guild.channels.cache.get(ALERTS_CHANNEL_ID);
      const embed = new EmbedBuilder()
        .setTitle("📢 Alerta del Staff")
        .setDescription(msg)
        .setFooter({ text: `Por ${message.author.tag}` })
        .setTimestamp();
      if (alertCh?.isTextBased()) {
        await alertCh.send({ embeds: [embed] });
        await message.reply("✅ Alerta enviada.");
        await logAction(message.member, "Alerta", null, msg);
      }
      return;
    }
  } catch (err) {
    console.error(err);
    await message.reply("❌ Error ejecutando comando.");
  }
});

/* ------------ Servidor Express para UptimeRobot ------------ */
const app = express();
app.get(PING_PATH, (_req, res) => res.send("OK"));
app.use((_req, res) => res.sendStatus(404));
app.listen(3000, () => console.log(`🌐 Ping server activo en ${PING_PATH}`));

/* ------------ Login ------------ */
client.login(process.env.DISCORD_TOKEN);
