import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import { poseCommandJson } from './src/command';
import { loadRegisterConfig } from './src/config';

let config: ReturnType<typeof loadRegisterConfig>;
try {
  config = loadRegisterConfig(process.env);
} catch (err) {
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(config.token);

async function registerCommands(): Promise<void> {
  console.log(`Registering /pose to guild ${config.guildId}...`);

  // A full replace of this application's commands in this one guild. Anything
  // not in the array is deleted from that guild. Guild-scoped, so the change
  // appears immediately rather than after global propagation.
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: [poseCommandJson()] },
  );

  console.log('Registered. /pose should appear in that server right away.');
}

registerCommands().catch((error: unknown) => {
  console.error('Error registering commands:', error);
  process.exit(1);
});
