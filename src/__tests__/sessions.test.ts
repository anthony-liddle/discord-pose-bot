import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPoseSessions, type LivePose } from '../sessions';

const TIMEOUT_MS = 5 * 60 * 1000;

function setup(
  overrides: {
    sendExpiry?: () => Promise<void>;
    markReplaced?: () => Promise<void>;
  } = {},
) {
  const sendExpiry = vi.fn<(pose: LivePose) => Promise<void>>(
    overrides.sendExpiry ?? (() => Promise.resolve()),
  );
  const markReplaced = vi.fn<(pose: LivePose) => Promise<void>>(
    overrides.markReplaced ?? (() => Promise.resolve()),
  );
  const log = vi.fn();
  const sessions = createPoseSessions({
    scheduler: {
      setTimeout: (cb, ms) => setTimeout(cb, ms),
      clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
    },
    now: () => Date.now(),
    sendExpiry,
    markReplaced,
    log,
  });
  return { sessions, sendExpiry, markReplaced, log };
}

function pose(overrides: Partial<LivePose> = {}): LivePose {
  return {
    channelId: 'chan-1',
    targetId: 'member-1',
    messageId: '1000',
    pose: 'Give a thumbs up.',
    deadline: Date.now() + TIMEOUT_MS,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 28, 22, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('expiry', () => {
  it('fires at the deadline and not before', async () => {
    const { sessions, sendExpiry } = setup();
    const issued = pose();
    sessions.issue(issued);

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(sendExpiry).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
    expect(sendExpiry).toHaveBeenCalledWith(issued);
    expect(sessions.isLive('chan-1')).toBe(false);
  });

  it('fires once only', async () => {
    const { sessions, sendExpiry } = setup();
    sessions.issue(pose());
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 10);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
  });

  it('runs to the deadline in the message, not a fresh timeout from issue', async () => {
    const { sessions, sendExpiry } = setup();
    const deadline = Date.now() + TIMEOUT_MS;
    // The send took two seconds to come back before the pose was issued.
    vi.setSystemTime(Date.now() + 2000);
    sessions.issue(pose({ deadline }));

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 2000);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
  });

  it('catches and logs a failed expiry send instead of throwing', async () => {
    const { sessions, sendExpiry, log } = setup({
      sendExpiry: () =>
        Promise.reject(Object.assign(new Error('gone'), { code: 10003 })),
    });
    sessions.issue(pose());

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'expiry_send_failed',
      { channelId: 'chan-1', userId: 'member-1' },
      '10003',
    );
  });

  it('catches a synchronous throw from the expiry send too', async () => {
    const { sessions, log } = setup({
      sendExpiry: () => {
        throw new Error('sync');
      },
    });
    sessions.issue(pose());
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(log).toHaveBeenCalledWith(
      'expiry_send_failed',
      expect.anything(),
      undefined,
    );
  });
});

describe('responding', () => {
  it('a target message before the deadline cancels the expiry', async () => {
    const { sessions, sendExpiry } = setup();
    sessions.issue(pose());

    await vi.advanceTimersByTimeAsync(60_000);
    sessions.handleMessage({
      channelId: 'chan-1',
      authorId: 'member-1',
      messageId: '2000',
    });

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 2);
    expect(sendExpiry).not.toHaveBeenCalled();
    expect(sessions.isLive('chan-1')).toBe(false);
  });

  it('a message from another user does not cancel it', async () => {
    const { sessions, sendExpiry } = setup();
    sessions.issue(pose());

    sessions.handleMessage({
      channelId: 'chan-1',
      authorId: 'admin-1',
      messageId: '2000',
    });

    expect(sessions.isLive('chan-1')).toBe(true);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
  });

  it('a target message in another channel does not cancel it', async () => {
    const { sessions, sendExpiry } = setup();
    sessions.issue(pose());

    sessions.handleMessage({
      channelId: 'chan-2',
      authorId: 'member-1',
      messageId: '2000',
    });

    expect(sessions.isLive('chan-1')).toBe(true);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
  });

  it('a target message older than the pose does not cancel it', async () => {
    const { sessions, sendExpiry } = setup();
    sessions.issue(pose({ messageId: '1000' }));

    // Snowflakes order by creation time, so 999 was sent before the pose.
    sessions.handleMessage({
      channelId: 'chan-1',
      authorId: 'member-1',
      messageId: '999',
    });

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
  });

  it('compares snowflakes numerically, not as strings', () => {
    const { sessions } = setup();
    sessions.issue(pose({ messageId: '999' }));
    // "1000" < "999" as strings, but it is the later message.
    sessions.handleMessage({
      channelId: 'chan-1',
      authorId: 'member-1',
      messageId: '1000',
    });
    expect(sessions.isLive('chan-1')).toBe(false);
  });

  it('ignores a message in a channel with no live pose', () => {
    const { sessions, log } = setup();
    sessions.handleMessage({
      channelId: 'chan-1',
      authorId: 'member-1',
      messageId: '2000',
    });
    expect(log).not.toHaveBeenCalled();
  });
});

describe('replacing a live pose', () => {
  it('cancels the old timer, marks the old message, and only one expiry fires', async () => {
    const { sessions, sendExpiry, markReplaced } = setup();
    const first = pose({ messageId: '1000', pose: 'Give a thumbs up.' });
    sessions.issue(first);

    await vi.advanceTimersByTimeAsync(60_000);
    const second = pose({ messageId: '2000', pose: 'Make a peace sign.' });
    const result = sessions.issue(second);

    expect(result.replaced).toBe(true);
    // The old timer is actually cleared. This pins the cancel directly, as
    // well as through the expiry counts below.
    expect(vi.getTimerCount()).toBe(1);
    expect(markReplaced).toHaveBeenCalledTimes(1);
    expect(markReplaced).toHaveBeenCalledWith(first);

    // Past the first pose's deadline: nothing, because it was cancelled.
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 60_000);
    expect(sendExpiry).not.toHaveBeenCalled();

    // At the second pose's deadline: exactly one expiry, for the second pose.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
    expect(sendExpiry).toHaveBeenCalledWith(second);

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 10);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
  });

  it('reports no replacement when nothing was live', () => {
    const { sessions, markReplaced } = setup();
    expect(sessions.issue(pose()).replaced).toBe(false);
    expect(markReplaced).not.toHaveBeenCalled();
  });

  it('does not mark a pose that already expired', async () => {
    const { sessions, markReplaced } = setup();
    sessions.issue(pose());
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(sessions.issue(pose({ messageId: '2000' })).replaced).toBe(false);
    expect(markReplaced).not.toHaveBeenCalled();
  });

  it('a failed edit of the old message is caught and cannot cause a second expiry', async () => {
    const { sessions, sendExpiry, log } = setup({
      markReplaced: () =>
        Promise.reject(Object.assign(new Error('no'), { code: 50013 })),
    });
    sessions.issue(pose({ messageId: '1000' }));
    sessions.issue(pose({ messageId: '2000' }));

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 3);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'mark_replaced_failed',
      { channelId: 'chan-1', userId: 'member-1' },
      '50013',
    );
  });

  it('a response after replacement cancels the new pose', async () => {
    const { sessions, sendExpiry } = setup();
    sessions.issue(pose({ messageId: '1000' }));
    sessions.issue(pose({ messageId: '2000' }));
    sessions.handleMessage({
      channelId: 'chan-1',
      authorId: 'member-1',
      messageId: '3000',
    });
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 3);
    expect(sendExpiry).not.toHaveBeenCalled();
  });

  it('keeps channels independent', async () => {
    const { sessions, sendExpiry, markReplaced } = setup();
    sessions.issue(pose({ channelId: 'chan-1', messageId: '1000' }));
    sessions.issue(pose({ channelId: 'chan-2', messageId: '2000' }));
    expect(markReplaced).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(sendExpiry).toHaveBeenCalledTimes(2);
  });
});

describe('ticket closed', () => {
  it('channel delete clears the timer and the last-pose memory', async () => {
    const { sessions, sendExpiry } = setup();
    sessions.issue(pose());
    expect(sessions.lastPose('chan-1')).toBe('Give a thumbs up.');

    sessions.handleChannelDelete('chan-1');

    expect(sessions.isLive('chan-1')).toBe(false);
    expect(sessions.lastPose('chan-1')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 2);
    expect(sendExpiry).not.toHaveBeenCalled();
  });

  it('channel delete clears last-pose memory even after the pose expired', async () => {
    const { sessions } = setup();
    sessions.issue(pose());
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(sessions.lastPose('chan-1')).toBe('Give a thumbs up.');
    sessions.handleChannelDelete('chan-1');
    expect(sessions.lastPose('chan-1')).toBeUndefined();
  });

  it('deleting another channel leaves this one alone', async () => {
    const { sessions, sendExpiry } = setup();
    sessions.issue(pose());
    sessions.handleChannelDelete('chan-2');
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(sendExpiry).toHaveBeenCalledTimes(1);
  });
});

describe('last pose memory', () => {
  it('remembers the last pose after it is answered, so a re-roll differs', () => {
    const { sessions } = setup();
    sessions.issue(pose({ pose: 'Give a thumbs up.' }));
    sessions.handleMessage({
      channelId: 'chan-1',
      authorId: 'member-1',
      messageId: '2000',
    });
    expect(sessions.lastPose('chan-1')).toBe('Give a thumbs up.');
  });
});

describe('logging', () => {
  it('logs only event type, channel ID and user ID', async () => {
    const { sessions, log } = setup();
    sessions.issue(pose());
    sessions.handleMessage({
      channelId: 'chan-1',
      authorId: 'member-1',
      messageId: '2000',
    });
    for (const call of log.mock.calls) {
      expect(typeof call[0]).toBe('string');
      expect(Object.keys(call[1]).sort()).toEqual(['channelId', 'userId']);
    }
    expect(log).toHaveBeenCalledWith('pose_answered', {
      channelId: 'chan-1',
      userId: 'member-1',
    });
  });
});
