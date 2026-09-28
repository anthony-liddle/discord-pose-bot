import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from 'discord.js';
import { createClient } from '../client';
import { wireBot, type BotDeps } from '../bot';
import type { PoseSessions } from '../sessions';

let client: Client | undefined;

afterEach(async () => {
  await client?.destroy();
  client = undefined;
});

function setup(overrides: Partial<BotDeps> = {}) {
  client = createClient();
  const sessions = {
    issue: vi.fn(),
    handleMessage: vi.fn(),
    handleChannelDelete: vi.fn(),
    lastPose: vi.fn(),
    isLive: vi.fn(),
  } satisfies PoseSessions;
  const log = vi.fn();
  const handlePose = vi.fn(async () => {});
  wireBot(client, { sessions, handlePose, log, ...overrides });
  return { client, sessions, log, handlePose };
}

const flush = () => new Promise((r) => setImmediate(r));

function fakeInteraction(overrides: Record<string, unknown> = {}) {
  return {
    isChatInputCommand: () => true,
    isRepliable: () => true,
    commandName: 'pose',
    channelId: 'chan-1',
    user: { id: 'admin-1' },
    replied: false,
    deferred: true,
    reply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('messageCreate', () => {
  it('passes channel, author and message IDs to the sessions', () => {
    const { client, sessions } = setup();
    client.emit('messageCreate', {
      inGuild: () => true,
      channelId: 'chan-1',
      id: '2000',
      author: { id: 'member-1' },
    } as never);
    expect(sessions.handleMessage).toHaveBeenCalledWith({
      channelId: 'chan-1',
      authorId: 'member-1',
      messageId: '2000',
    });
  });

  it('ignores DMs', () => {
    const { client, sessions } = setup();
    client.emit('messageCreate', {
      inGuild: () => false,
      channelId: 'dm',
      id: '1',
      author: { id: 'x' },
    } as never);
    expect(sessions.handleMessage).not.toHaveBeenCalled();
  });

  it('survives a throwing handler', () => {
    const { client, log } = setup();
    expect(() =>
      client.emit('messageCreate', {
        inGuild: () => true,
        get channelId(): string {
          throw new Error('boom');
        },
      } as never),
    ).not.toThrow();
    expect(log).toHaveBeenCalledWith(
      'handler_error',
      { event: 'messageCreate' } as never,
      undefined,
    );
  });
});

describe('channel and thread delete', () => {
  it('clears the channel on channelDelete', () => {
    const { client, sessions } = setup();
    client.emit('channelDelete', { id: 'chan-1' } as never);
    expect(sessions.handleChannelDelete).toHaveBeenCalledWith('chan-1');
  });

  it('clears the thread on threadDelete', () => {
    const { client, sessions } = setup();
    client.emit('threadDelete', { id: 'thread-1' } as never);
    expect(sessions.handleChannelDelete).toHaveBeenCalledWith('thread-1');
  });
});

describe('interactionCreate', () => {
  it('routes /pose to the handler', async () => {
    const { client, handlePose } = setup();
    const interaction = fakeInteraction();
    client.emit('interactionCreate', interaction as never);
    await flush();
    expect(handlePose).toHaveBeenCalledWith(interaction);
  });

  it('ignores other commands', async () => {
    const { client, handlePose } = setup();
    client.emit(
      'interactionCreate',
      fakeInteraction({ commandName: 'other' }) as never,
    );
    await flush();
    expect(handlePose).not.toHaveBeenCalled();
  });

  it('reports a handler rejection to the admin in-band, and does not crash', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { client, log } = setup({
        handlePose: async () => {
          throw Object.assign(new Error('kaboom'), { code: 50035 });
        },
      });
      const interaction = fakeInteraction();
      client.emit('interactionCreate', interaction as never);
      await flush();
      await flush();
      expect(interaction.followUp).toHaveBeenCalledWith({
        content: expect.stringContaining('Error: kaboom'),
        flags: expect.any(Number),
        allowedMentions: { parse: [] },
      });
      expect(log).toHaveBeenCalledWith(
        'handler_error',
        {
          event: 'interactionCreate',
          channelId: 'chan-1',
          userId: 'admin-1',
        } as never,
        '50035',
      );
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('replies rather than following up when nothing was sent yet', async () => {
    const { client } = setup({
      handlePose: async () => {
        throw new Error('early');
      },
    });
    const interaction = fakeInteraction({ deferred: false });
    client.emit('interactionCreate', interaction as never);
    await flush();
    await flush();
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('swallows a failure to deliver the error report', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { client, log } = setup({
        handlePose: async () => {
          throw new Error('first');
        },
      });
      const interaction = fakeInteraction({
        followUp: vi.fn(async () => {
          throw Object.assign(new Error('Unknown interaction'), {
            code: 10062,
          });
        }),
      });
      client.emit('interactionCreate', interaction as never);
      await flush();
      await flush();
      expect(log).toHaveBeenCalledWith(
        'error_report_failed',
        { channelId: 'chan-1', userId: 'admin-1' },
        '10062',
      );
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('client errors', () => {
  it('has an error listener, so an emitted error cannot kill the process', () => {
    const { client, log } = setup();
    expect(() =>
      client.emit('error', Object.assign(new Error('ws'), { code: 4000 })),
    ).not.toThrow();
    expect(log).toHaveBeenCalledWith('client_error', {}, '4000');
  });
});
