require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const commands = [
  {
    name: 'alert',
    description: 'Envía un mensaje a un canal específico (solo staff)',
    options: [
      {
        name: 'canal',
        description: 'Selecciona el canal destino',
        type: ApplicationCommandOptionType.Channel,
        required: true
      },
      {
        name: 'mensaje',
        description: 'Texto del aviso',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ]
  }
];

(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Slash /alert desplegado');
  } catch (e) {
    console.error('❌ Error desplegando slash:', e);
  }
})();
