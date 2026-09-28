/**
 * Pose sessions: one live pose and one timer per channel.
 *
 * Deliberately free of discord.js. Everything that touches Discord arrives as
 * an injected callback, and time arrives as an injected scheduler and clock, so
 * vitest fake timers drive the whole lifecycle.
 *
 * Nothing here persists. A restart drops every live timer; the pose message
 * shows its deadline, so a lost timer is visible rather than silent.
 */

export interface LivePose {
  channelId: string;
  targetId: string;
  /** The pose message's ID. Snowflakes order by creation time. */
  messageId: string;
  pose: string;
  /** Epoch milliseconds, the same instant rendered in the pose message. */
  deadline: number;
}

export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface LogIds {
  channelId: string;
  userId: string;
}

/** Event type, channel ID and user ID, plus at most an error code. */
export type LogEvent = (event: string, ids: LogIds, code?: string) => void;

export interface PoseSessionDeps {
  scheduler: Scheduler;
  now: () => number;
  /** Replies to the pose message saying it expired. */
  sendExpiry: (pose: LivePose) => Promise<void>;
  /** Edits a replaced pose message to strike it through. */
  markReplaced: (pose: LivePose) => Promise<void>;
  log: LogEvent;
}

export interface IncomingMessage {
  channelId: string;
  authorId: string;
  messageId: string;
}

export interface PoseSessions {
  /**
   * Arms a timer for a pose that has already been posted. Any live pose in the
   * same channel is cancelled first, synchronously, so exactly one expiry can
   * ever fire per channel no matter what the old message's edit does later.
   *
   * Order is by message, not by arrival. If the incoming pose's message is
   * older than the live one (two admins, and the older send resolved second),
   * the live pose stays armed and the incoming one is struck through instead,
   * so "use the one below" always points at a real message.
   */
  issue(pose: LivePose): IssueResult;
  handleMessage(message: IncomingMessage): void;
  handleChannelDelete(channelId: string): void;
  lastPose(channelId: string): string | undefined;
  isLive(channelId: string): boolean;
}

export interface IssueResult {
  /** A live, older pose in the channel was struck through for this one. */
  replaced: boolean;
  /** This pose was older than the live one, so it was struck through. */
  superseded: boolean;
}

interface Session {
  pose: LivePose;
  handle: unknown;
}

export function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' || typeof code === 'number'
    ? String(code)
    : undefined;
}

function ids(pose: LivePose): LogIds {
  return { channelId: pose.channelId, userId: pose.targetId };
}

/**
 * True only when the incoming message is provably older than the live one.
 * Anything that cannot be compared falls back to arrival order, the incoming
 * pose winning, which is how replacement worked before order was checked.
 */
function isOlder(incomingId: string, liveId: string): boolean {
  try {
    return BigInt(incomingId) < BigInt(liveId);
  } catch {
    return false;
  }
}

function isAfter(messageId: string, poseMessageId: string): boolean {
  try {
    return BigInt(messageId) > BigInt(poseMessageId);
  } catch {
    // Not a snowflake. Should not happen with real Discord IDs; err towards
    // treating it as a response, which only stops the clock.
    return true;
  }
}

export function createPoseSessions(deps: PoseSessionDeps): PoseSessions {
  const live = new Map<string, Session>();
  const lastPoses = new Map<string, string>();

  /** Runs a Discord callback without ever letting it throw or reject. */
  function attempt(
    failureEvent: string,
    pose: LivePose,
    action: (pose: LivePose) => Promise<void>,
  ): void {
    let pending: Promise<void>;
    try {
      pending = action(pose);
    } catch (err) {
      deps.log(failureEvent, ids(pose), errorCode(err));
      return;
    }
    pending.catch((err: unknown) => {
      deps.log(failureEvent, ids(pose), errorCode(err));
    });
  }

  function cancel(channelId: string): Session | undefined {
    const session = live.get(channelId);
    if (session) {
      deps.scheduler.clearTimeout(session.handle);
      live.delete(channelId);
    }
    return session;
  }

  function expire(session: Session): void {
    // Only a live session's timer can fire: every path that ends a session
    // goes through cancel(), which clears the timer before deleting it. There
    // is deliberately no second identity check here. One existed and hid a
    // missing cancel from the tests.
    live.delete(session.pose.channelId);
    deps.log('pose_expired', ids(session.pose));
    attempt('expiry_send_failed', session.pose, deps.sendExpiry);
  }

  return {
    issue(pose) {
      const current = live.get(pose.channelId);
      if (current && isOlder(pose.messageId, current.pose.messageId)) {
        deps.log('pose_superseded', ids(pose));
        attempt('mark_replaced_failed', pose, deps.markReplaced);
        return { replaced: false, superseded: true };
      }

      const previous = cancel(pose.channelId);

      const session: Session = { pose, handle: undefined };
      const delay = Math.max(0, pose.deadline - deps.now());
      session.handle = deps.scheduler.setTimeout(() => expire(session), delay);
      live.set(pose.channelId, session);
      lastPoses.set(pose.channelId, pose.pose);
      deps.log('pose_issued', ids(pose));

      if (previous) {
        deps.log('pose_replaced', ids(previous.pose));
        attempt('mark_replaced_failed', previous.pose, deps.markReplaced);
      }
      return { replaced: previous !== undefined, superseded: false };
    },

    handleMessage({ channelId, authorId, messageId }) {
      const session = live.get(channelId);
      if (!session) return;
      if (authorId !== session.pose.targetId) return;
      if (!isAfter(messageId, session.pose.messageId)) return;
      cancel(channelId);
      deps.log('pose_answered', ids(session.pose));
    },

    handleChannelDelete(channelId) {
      const session = cancel(channelId);
      lastPoses.delete(channelId);
      if (session) deps.log('pose_cleared_channel_deleted', ids(session.pose));
    },

    lastPose(channelId) {
      return lastPoses.get(channelId);
    },

    isLive(channelId) {
      return live.has(channelId);
    },
  };
}
