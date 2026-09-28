import { GatewayIntentBits, IntentsBitField } from 'discord.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { Client } from 'discord.js';
import { createClient } from '../client';

let client: Client | undefined;

afterEach(async () => {
  await client?.destroy();
  client = undefined;
});

describe('the client production builds', () => {
  // The privacy property this bot is built around. Without Message Content the
  // bot never receives attachment data from ticket channels, including the ID
  // photos. Without Guild Members it never sees the member list.
  it('does not request Message Content', () => {
    client = createClient();
    expect(client.options.intents.has(GatewayIntentBits.MessageContent)).toBe(
      false,
    );
  });

  it('does not request Guild Members', () => {
    client = createClient();
    expect(client.options.intents.has(GatewayIntentBits.GuildMembers)).toBe(
      false,
    );
  });

  it('requests exactly Guilds and Guild Messages', () => {
    client = createClient();
    const expected = new IntentsBitField([
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ]);
    expect(client.options.intents.bitfield).toBe(expected.bitfield);
  });
});
