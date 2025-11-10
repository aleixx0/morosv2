require("dotenv").config();
const { REST, Routes, ApplicationCommandOptionType } = require("discord.js");

const commands = [
  {
    name: "alert",
    description: "Envía un mensaje a un canal específico (solo staff)",
    options: [
      {
        name: "canal",
        description: "Selecciona el canal donde enviar la alerta",
        type: ApplicationCommandOptionType.Channel,
        required: true,
      },
      {
        name: "mensaje",
        description: "Mensaje que quieres enviar",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("⏳ Registrando comandos / ...");
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID,
        ),
        { body: commands },
      );
      console.log("✅ /alert registrado en tu servidor.");
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: commands,
      });
      console.log("✅ /alert registrado globalmente.");
    }
  } catch (err) {
    console.error(err);
  }
})();
