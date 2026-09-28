import type { Client, TextChannel } from 'discord.js';
import { createClient } from '../../client';

export const GUILD_ID = '100000000000000001';
export const CHANNEL_ID = '100000000000000002';
export const BOT_ID = '100000000000000003';
export const MEMBER_ID = '100000000000000020';

let nextSnowflake = 100000000000001000n;
export function snowflake(): string {
  nextSnowflake += 1000n;
  return String(nextSnowflake);
}

export function rawMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: snowflake(),
    channel_id: CHANNEL_ID,
    guild_id: GUILD_ID,
    author: { id: MEMBER_ID, username: 'member', discriminator: '0' },
    content: '',
    attachments: [],
    embeds: [],
    mentions: [],
    mention_roles: [],
    timestamp: new Date().toISOString(),
    type: 0,
    ...overrides,
  };
}

/**
 * The client production builds, with one guild and one text channel added
 * through discord.js's own managers, as the gateway would. No login and no
 * gateway connection.
 */
export function realClientWithChannel(): {
  client: Client;
  channel: TextChannel;
} {
  const client = createClient();
  (client.guilds as unknown as { _add(data: unknown): unknown })._add({
    id: GUILD_ID,
    name: 'test',
    channels: [{ id: CHANNEL_ID, type: 0, name: 'ticket', guild_id: GUILD_ID }],
    roles: [],
    members: [],
    emojis: [],
    stickers: [],
  });
  // MessageCreate compares authors against the logged-in user.
  (client as unknown as { user: { id: string } }).user = { id: BOT_ID };
  const channel = client.channels.cache.get(CHANNEL_ID) as TextChannel;
  return { client, channel };
}

export interface RestCall {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
  /** The message ID the stub answered with. */
  responseId: string;
}

/**
 * Replaces the HTTP layer of the real REST client. The API base is pointed at
 * an unroutable host first, so if a future discord.js stops honouring the stub
 * the test fails with a connection error instead of reaching discord.com.
 */
export function stubRest(client: Client): RestCall[] {
  const calls: RestCall[] = [];
  const options = client.rest.options as { api: string; makeRequest: unknown };
  options.api = 'http://discord.invalid/api';
  client.rest.setToken('not-a-real-token');
  options.makeRequest = async (
    url: string,
    init: { method: string; body?: string },
  ) => {
    const path = String(url).replace(/^.*\/api\/v\d+/, '');
    const responseId = path.match(/\/messages\/(\d+)$/)?.[1] ?? snowflake();
    calls.push({
      method: init.method,
      path,
      body: init.body ? JSON.parse(init.body) : undefined,
      responseId,
    });
    const message = rawMessage({
      id: responseId,
      author: { id: BOT_ID, username: 'bot', discriminator: '0', bot: true },
      content: 'from the bot',
    });
    return new Response(JSON.stringify(message), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return calls;
}
