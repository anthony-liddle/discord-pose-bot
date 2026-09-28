import { Client, GatewayIntentBits, Options } from 'discord.js';

/**
 * Guilds: slash commands, the channel cache, and channel deletes.
 * GuildMessages: an event when the member posts, so the clock can stop.
 *
 * NOT MessageContent. Without it, message text and attachments arrive empty,
 * so the bot never receives the ID photos posted in ticket channels. NOT
 * GuildMembers. A test pins this list; do not add to it to make a test easier.
 *
 * Message cache: zero. discord.js keeps the last 200 messages per channel by
 * default. A message that @mentions the bot arrives with its content and
 * attachments even without Message Content, so a member who tags the bot in
 * their ID message would leave that photo's link in memory until evicted.
 * Every received message (gateway creates, the messages they reply to,
 * forwarded snapshots, thread starters) is stored through the channel's
 * MessageManager, and thread and guild message managers share its cache
 * setting. The bot never reads a cached message: it posts, edits and replies
 * by the IDs its own sends return. Tests pin all of this on this client.
 *
 * No partials, so the action paths that cache partial payloads stay closed.
 */
export function createClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 0,
    }),
  });
}
