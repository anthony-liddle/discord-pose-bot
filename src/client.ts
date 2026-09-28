import { Client, GatewayIntentBits } from 'discord.js';

/**
 * Guilds: slash commands, the channel cache, and channel deletes.
 * GuildMessages: an event when the member posts, so the clock can stop.
 *
 * NOT MessageContent. Without it, message text and attachments arrive empty,
 * so the bot never receives the ID photos posted in ticket channels. NOT
 * GuildMembers. A test pins this list; do not add to it to make a test easier.
 */
export function createClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });
}
