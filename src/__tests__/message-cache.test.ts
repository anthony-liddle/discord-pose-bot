import fs from 'fs';
import path from 'path';
import type {
  ChatInputCommandInteraction,
  Client,
  Message,
  TextChannel,
} from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wireBot } from '../bot';
import { makeDiscordActions } from '../discord-actions';
import { handlePose } from '../pose-command';
import { createPoseSessions } from '../sessions';
import {
  CHANNEL_ID,
  MEMBER_ID,
  rawMessage,
  realClientWithChannel,
  snowflake,
  stubRest,
} from './helpers/real-client';

let client: Client | undefined;

afterEach(async () => {
  await client?.destroy();
  client = undefined;
});

function deliver(c: Client, data: Record<string, unknown>): void {
  (
    c as unknown as {
      actions: { MessageCreate: { handle(d: unknown): unknown } };
    }
  ).actions.MessageCreate.handle(data);
}

// A member's ID message that tags the bot: the one case where Discord sends
// content and attachments without the Message Content intent. It also replies
// to an earlier message, which discord.js caches separately.
function idPhotoMessage() {
  return rawMessage({
    content: '<@100000000000000003> here is my ID',
    attachments: [
      {
        id: snowflake(),
        filename: 'id.png',
        url: 'https://cdn.discordapp.com/attachments/1/2/id.png',
        proxy_url: 'https://media.discordapp.net/attachments/1/2/id.png',
        size: 1234,
      },
    ],
    referenced_message: rawMessage({ content: 'an earlier message' }),
  });
}

describe('the message cache on the client production builds', () => {
  it('is a zero-size collection on a real guild channel', () => {
    const real = realClientWithChannel();
    client = real.client;
    expect(real.channel).toBeDefined();
    expect(
      (real.channel.messages.cache as unknown as { maxSize: number }).maxSize,
    ).toBe(0);
  });

  it('keeps nothing from a received message, including its attachments and the message it replies to', () => {
    const real = realClientWithChannel();
    client = real.client;
    let received: Message | undefined;
    client.on('messageCreate', (m) => (received = m));

    deliver(client, idPhotoMessage());

    // Prove the fixture is real before trusting the empty cache: the event
    // fired with the attachment, so discord.js did process the message.
    expect(received).toBeDefined();
    expect(received!.attachments.size).toBe(1);
    expect(real.channel.messages.cache.size).toBe(0);
  });

  it('requests no partials, so no other action path caches message payloads', () => {
    const real = realClientWithChannel();
    client = real.client;
    expect(client.options.partials ?? []).toEqual([]);
  });
});

describe('messageCreate hands the sessions only three IDs', () => {
  it('passes a plain object with channel, author and message IDs, never the message', () => {
    const real = realClientWithChannel();
    client = real.client;
    const handleMessage = vi.fn();
    wireBot(client, {
      sessions: {
        issue: vi.fn(),
        handleMessage,
        handleChannelDelete: vi.fn(),
        lastPose: vi.fn(),
        isLive: vi.fn(),
      },
      handlePose: vi.fn(),
      log: vi.fn(),
    });

    const data = idPhotoMessage();
    deliver(client, data);

    expect(handleMessage).toHaveBeenCalledTimes(1);
    const arg = handleMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.getPrototypeOf(arg)).toBe(Object.prototype);
    expect(Object.keys(arg).sort()).toEqual([
      'authorId',
      'channelId',
      'messageId',
    ]);
    expect(Object.values(arg).every((v) => typeof v === 'string')).toBe(true);
    expect(arg).toEqual({
      channelId: CHANNEL_ID,
      authorId: MEMBER_ID,
      messageId: data.id,
    });
  });
});

describe('issue, replace and expire all work by reference with the cache off', () => {
  it('posts, strikes through by ID, and replies by ID, caching nothing', async () => {
    const real = realClientWithChannel();
    client = real.client;
    const calls = stubRest(client);
    const channel: TextChannel = real.channel;

    // Timers captured and fired by hand. vi fake timers would also freeze the
    // REST client's own timers.
    const timers: Array<{ cb: () => void; cancelled: boolean }> = [];
    const actions = makeDiscordActions(client, undefined);
    const sessions = createPoseSessions({
      scheduler: {
        setTimeout: (cb) => {
          const t = { cb, cancelled: false };
          timers.push(t);
          return t;
        },
        clearTimeout: (t) => {
          (t as { cancelled: boolean }).cancelled = true;
        },
      },
      now: () => Date.now(),
      sendExpiry: actions.sendExpiry,
      markReplaced: actions.markReplaced,
      log: vi.fn(),
    });

    const interaction = () =>
      ({
        channelId: CHANNEL_ID,
        channel,
        client,
        inGuild: () => true,
        deferReply: vi.fn(async () => {}),
        editReply: vi.fn(async () => {}),
        options: {
          getUser: () => ({ id: MEMBER_ID, bot: false }),
          getString: () => null,
        },
      }) as unknown as ChatInputCommandInteraction;
    const deps = {
      sessions,
      poses: [
        'Cover one ear with your hand.',
        'Touch the tip of your nose with one finger.',
      ],
      random: () => 0,
      now: () => Date.now(),
      timeoutMs: 300_000,
      log: vi.fn(),
    };

    await handlePose(interaction(), deps);
    expect(calls).toHaveLength(1);
    expect(sessions.isLive(CHANNEL_ID)).toBe(true);

    await handlePose(interaction(), deps);
    // Let the fire-and-forget strike-through edit reach the stub.
    await vi.waitFor(() => expect(calls).toHaveLength(3));

    const [firstPost, secondPost, edit] = calls;
    expect(firstPost.method).toBe('POST');
    expect(firstPost.path).toBe(`/channels/${CHANNEL_ID}/messages`);
    expect(secondPost.method).toBe('POST');
    expect(edit.method).toBe('PATCH');
    // The strike-through targets the first pose by the ID its send returned.
    expect(edit.path).toBe(
      `/channels/${CHANNEL_ID}/messages/${firstPost.responseId}`,
    );
    expect(edit.body?.content).toMatch(/This pose was replaced/);

    // The first timer was cancelled by the replace; fire the live one.
    expect(timers.map((t) => t.cancelled)).toEqual([true, false]);
    timers[1].cb();
    await vi.waitFor(() => expect(calls).toHaveLength(4));

    const expiry = calls[3];
    expect(expiry.method).toBe('POST');
    // The expiry replies to the second pose by the ID its send returned.
    expect(expiry.body?.message_reference).toEqual({
      message_id: secondPost.responseId,
      fail_if_not_exists: false,
    });
    expect(expiry.body?.allowed_mentions).toEqual({
      parse: [],
      users: [MEMBER_ID],
      replied_user: false,
    });

    expect(channel.messages.cache.size).toBe(0);
  });
});

describe('source', () => {
  it('never reads the message cache or a cached last message', () => {
    const srcDir = path.join(__dirname, '..');
    const offenders: string[] = [];
    for (const name of fs.readdirSync(srcDir)) {
      if (!name.endsWith('.ts')) continue;
      const text = fs.readFileSync(path.join(srcDir, name), 'utf8');
      if (/messages\.cache|\.lastMessage\b|\.lastMessage\?/.test(text)) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });
});
