import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as copy from '../copy';
import { handlePose, type PoseCommandDeps } from '../pose-command';
import { createPoseSessions, type LivePose } from '../sessions';
import { MAX_POSE_LENGTH } from '../poses';

const TIMEOUT_MS = 5 * 60 * 1000;

interface FakeOptions {
  target?: { id: string; bot: boolean };
  custom?: string | null;
  inGuild?: boolean;
  send?: (payload: unknown) => Promise<{ id: string }>;
  sendable?: boolean;
  channel?: 'cached' | 'uncached';
}

function fakeInteraction(opts: FakeOptions = {}) {
  const calls: string[] = [];
  const target = opts.target ?? { id: 'member-1', bot: false };
  let nextId = 1000;
  const send = vi.fn(
    opts.send ??
      (async () => {
        calls.push('send');
        nextId += 1000;
        return { id: String(nextId) };
      }),
  );
  const channel = {
    id: 'chan-1',
    isSendable: () => opts.sendable ?? true,
    send,
  };
  const interaction = {
    channelId: 'chan-1',
    user: { id: 'admin-1' },
    channel: opts.channel === 'uncached' ? null : channel,
    client: {
      channels: {
        fetch: vi.fn(async () => {
          calls.push('fetchChannel');
          return channel;
        }),
      },
    },
    inGuild: () => {
      calls.push('inGuild');
      return opts.inGuild ?? true;
    },
    deferReply: vi.fn(async () => {
      calls.push('deferReply');
    }),
    editReply: vi.fn(async () => {
      calls.push('editReply');
    }),
    options: {
      getUser: vi.fn(() => {
        calls.push('getUser');
        return target;
      }),
      getString: vi.fn(() => {
        calls.push('getString');
        return opts.custom ?? null;
      }),
    },
  };
  return {
    interaction: interaction as unknown as ChatInputCommandInteraction,
    raw: interaction,
    send,
    calls,
  };
}

function makeDeps(overrides: Partial<PoseCommandDeps> = {}) {
  const sendExpiry = vi.fn<(pose: LivePose) => Promise<void>>(async () => {});
  const markReplaced = vi.fn<(pose: LivePose) => Promise<void>>(async () => {});
  const log = vi.fn();
  const sessions = createPoseSessions({
    scheduler: {
      setTimeout: (cb, ms) => setTimeout(cb, ms),
      clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
    },
    now: () => Date.now(),
    sendExpiry,
    markReplaced,
    log,
  });
  const deps: PoseCommandDeps = {
    sessions,
    poses: ['Give a thumbs up.', 'Make a peace sign.'],
    random: () => 0,
    now: () => Date.now(),
    timeoutMinutes: 5,
    adminRoleId: undefined,
    log,
    ...overrides,
  };
  return { deps, sessions, sendExpiry, markReplaced, log };
}

function lastEditReply(raw: { editReply: ReturnType<typeof vi.fn> }) {
  const calls = raw.editReply.mock.calls;
  return calls[calls.length - 1][0] as {
    content: string;
    allowedMentions: unknown;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 28, 22, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('order of operations', () => {
  it('defers ephemerally before doing anything else', async () => {
    const { interaction, raw, calls } = fakeInteraction();
    await handlePose(interaction, makeDeps().deps);
    expect(calls[0]).toBe('deferReply');
    expect(raw.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
  });

  it('sends, then arms, then confirms', async () => {
    const { interaction, calls } = fakeInteraction();
    const { deps, sessions } = makeDeps();
    await handlePose(interaction, deps);
    expect(calls.indexOf('send')).toBeLessThan(calls.indexOf('editReply'));
    expect(sessions.isLive('chan-1')).toBe(true);
  });

  it('fetches the channel when it is not cached', async () => {
    const { interaction, calls } = fakeInteraction({ channel: 'uncached' });
    const { deps, sessions } = makeDeps();
    await handlePose(interaction, deps);
    expect(calls).toContain('fetchChannel');
    expect(sessions.isLive('chan-1')).toBe(true);
  });
});

describe('refusals', () => {
  it('refuses a bot target ephemerally and posts nothing', async () => {
    const { interaction, raw, send } = fakeInteraction({
      target: { id: 'bot-1', bot: true },
    });
    const { deps, sessions } = makeDeps();
    await handlePose(interaction, deps);
    expect(send).not.toHaveBeenCalled();
    expect(sessions.isLive('chan-1')).toBe(false);
    expect(lastEditReply(raw).content).toMatch(/is a bot/);
  });

  it('refuses outside a guild', async () => {
    const { interaction, raw, send } = fakeInteraction({ inGuild: false });
    await handlePose(interaction, makeDeps().deps);
    expect(send).not.toHaveBeenCalled();
    expect(lastEditReply(raw).content).toMatch(/only works in a server/);
  });

  it('refuses a channel it cannot send in', async () => {
    const { interaction, raw, send } = fakeInteraction({ sendable: false });
    await handlePose(interaction, makeDeps().deps);
    expect(send).not.toHaveBeenCalled();
    expect(lastEditReply(raw).content).toMatch(/can't post messages/);
  });

  it('refuses an overlong custom pose even if Discord let it through', async () => {
    const { interaction, raw, send } = fakeInteraction({
      custom: 'a'.repeat(MAX_POSE_LENGTH + 1),
    });
    await handlePose(interaction, makeDeps().deps);
    expect(send).not.toHaveBeenCalled();
    expect(lastEditReply(raw).content).toMatch(/too long/);
  });
});

describe('the pose message', () => {
  it('pings only the target', async () => {
    const { interaction, send } = fakeInteraction();
    await handlePose(interaction, makeDeps().deps);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedMentions: { parse: [], users: ['member-1'] },
      }),
    );
    const payload = send.mock.calls[0][0] as { content: string };
    expect(payload.content.startsWith('<@member-1> ')).toBe(true);
  });

  it('shows the Admin role to tag without pinging it', async () => {
    const { interaction, send } = fakeInteraction();
    await handlePose(interaction, makeDeps({ adminRoleId: 'role-1' }).deps);
    const payload = send.mock.calls[0][0] as {
      content: string;
      allowedMentions: unknown;
    };
    expect(payload.content).toContain(', and tag <@&role-1>.');
    // Exact, so neither parse: ['roles'] nor roles: ['role-1'] gets through.
    expect(payload.allowedMentions).toEqual({
      parse: [],
      users: ['member-1'],
    });
  });

  it('uses the custom text when given', async () => {
    const { interaction, send } = fakeInteraction({
      custom: '  Wave at the camera.  ',
    });
    await handlePose(interaction, makeDeps().deps);
    const payload = send.mock.calls[0][0] as { content: string };
    expect(payload.content).toContain('**Wave at the camera.**');
  });

  it('treats blank custom text as not given', async () => {
    const { interaction, send } = fakeInteraction({ custom: '   ' });
    await handlePose(interaction, makeDeps().deps);
    const payload = send.mock.calls[0][0] as { content: string };
    expect(payload.content).toContain('**Give a thumbs up.**');
  });

  it('never repeats the pose last issued in the channel', async () => {
    const { deps } = makeDeps({ random: () => 0 });
    const first = fakeInteraction();
    await handlePose(first.interaction, deps);
    const second = fakeInteraction();
    await handlePose(second.interaction, deps);
    const a = (first.send.mock.calls[0][0] as { content: string }).content;
    const b = (second.send.mock.calls[0][0] as { content: string }).content;
    expect(a).toContain('Give a thumbs up.');
    expect(b).toContain('Make a peace sign.');
  });

  it('shows the same deadline the timer uses', async () => {
    const { interaction, send } = fakeInteraction();
    const { deps, sendExpiry } = makeDeps();
    await handlePose(interaction, deps);
    const seconds = (Date.now() + TIMEOUT_MS) / 1000;
    const payload = send.mock.calls[0][0] as { content: string };
    expect(payload.content).toContain(`within 5 minutes, by <t:${seconds}:t>,`);
    expect(payload.content).not.toContain(':R>');
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
  });
});

describe('confirmation', () => {
  it('confirms to the admin without pinging anyone', async () => {
    const { interaction, raw } = fakeInteraction();
    await handlePose(interaction, makeDeps().deps);
    const reply = lastEditReply(raw);
    expect(reply.content).toBe(
      'Posted a pose for <@member-1>: **Give a thumbs up.**',
    );
    expect(reply.allowedMentions).toEqual({ parse: [] });
  });

  it('says when it replaced a live pose', async () => {
    const { deps, markReplaced } = makeDeps();
    await handlePose(fakeInteraction().interaction, deps);
    const second = fakeInteraction();
    await handlePose(second.interaction, deps);
    expect(lastEditReply(second.raw).content).toMatch(/replaced the pose/);
    expect(markReplaced).toHaveBeenCalledTimes(1);
  });

  it('every refusal reply also pings no one', async () => {
    const { interaction, raw } = fakeInteraction({
      target: { id: 'bot-1', bot: true },
    });
    await handlePose(interaction, makeDeps().deps);
    expect(lastEditReply(raw).allowedMentions).toEqual({ parse: [] });
  });
});

describe('a failed send', () => {
  it('tells the admin in plain words and arms nothing', async () => {
    const { interaction, raw } = fakeInteraction({
      send: async () => {
        throw Object.assign(new Error('Missing Permissions'), { code: 50013 });
      },
    });
    const { deps, sessions, log } = makeDeps();
    await handlePose(interaction, deps);
    expect(sessions.isLive('chan-1')).toBe(false);
    expect(lastEditReply(raw).content).toMatch(
      /missing a permission in this channel/,
    );
    expect(log).toHaveBeenCalledWith(
      'pose_send_failed',
      { channelId: 'chan-1', userId: 'member-1' },
      '50013',
    );
  });

  it('leaves a still-live older pose alone', async () => {
    const { deps, sessions, markReplaced, sendExpiry } = makeDeps();
    await handlePose(fakeInteraction().interaction, deps);
    expect(sessions.isLive('chan-1')).toBe(true);

    const failing = fakeInteraction({
      send: async () => {
        throw new Error('boom');
      },
    });
    await handlePose(failing.interaction, deps);

    expect(markReplaced).not.toHaveBeenCalled();
    expect(sessions.isLive('chan-1')).toBe(true);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
  });
});

describe('overlapping /pose in one channel', () => {
  async function race(firstBack: 'older' | 'newer') {
    const { deps, sendExpiry, markReplaced } = makeDeps();
    let resolveOlder!: (m: { id: string }) => void;
    let resolveNewer!: (m: { id: string }) => void;
    const older = fakeInteraction({
      send: () => new Promise((r) => (resolveOlder = r)),
    });
    const newer = fakeInteraction({
      send: () => new Promise((r) => (resolveNewer = r)),
    });

    const runOlder = handlePose(older.interaction, deps);
    const runNewer = handlePose(newer.interaction, deps);
    await vi.advanceTimersByTimeAsync(0);
    // Message 1000 was created first in the channel, 2000 second. Which send
    // response reaches the bot first is up to the network.
    if (firstBack === 'newer') {
      resolveNewer({ id: '2000' });
      await vi.advanceTimersByTimeAsync(0);
      resolveOlder({ id: '1000' });
    } else {
      resolveOlder({ id: '1000' });
      await vi.advanceTimersByTimeAsync(0);
      resolveNewer({ id: '2000' });
    }
    await Promise.all([runOlder, runNewer]);
    return { older, newer, sendExpiry, markReplaced };
  }

  it.each(['older', 'newer'] as const)(
    'strikes through message 1000 and expires message 2000 when the %s send returns first',
    async (firstBack) => {
      const { sendExpiry, markReplaced } = await race(firstBack);

      expect(markReplaced).toHaveBeenCalledTimes(1);
      expect(markReplaced.mock.calls[0][0].messageId).toBe('1000');
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 3);
      expect(sendExpiry).toHaveBeenCalledTimes(1);
      expect(sendExpiry.mock.calls[0][0].messageId).toBe('2000');
    },
  );

  it('tells the admin whose older pose lost that a newer one was already posted', async () => {
    const { older, newer } = await race('newer');
    expect(lastEditReply(older.raw).content).toBe(
      copy.poseSuperseded('member-1'),
    );
    expect(lastEditReply(older.raw).allowedMentions).toEqual({ parse: [] });
    expect(lastEditReply(newer.raw).content).toMatch(/^Posted a pose for/);
  });

  it('confirms normally to both admins when the sends return in order', async () => {
    const { older, newer } = await race('older');
    expect(lastEditReply(older.raw).content).toMatch(/^Posted a pose for/);
    expect(lastEditReply(newer.raw).content).toMatch(/replaced the pose/);
  });
});
