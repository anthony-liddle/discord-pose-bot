/**
 * Every string a member or admin sees, in one place. The pose and expiry
 * messages are drafts awaiting approval; change them here and nowhere else.
 *
 * No discord.js import: mentions and timestamps are plain Discord markup.
 */

function unixSeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}

/** Short time, rendered in each reader's own timezone. "3:45 PM". */
function shortTime(ms: number): string {
  return `<t:${unixSeconds(ms)}:t>`;
}

function user(id: string): string {
  return `<@${id}>`;
}

/**
 * Who the member should tag: the Admin role's mention when ADMIN_ROLE_ID is
 * set, plain text otherwise. Every message that names the admins builds it
 * here, so they cannot drift apart.
 */
function admin(adminRoleId: string | undefined): string {
  return adminRoleId ? `<@&${adminRoleId}>` : 'an admin';
}

/**
 * Custom poses are admin-typed free text. Escape the characters that would
 * otherwise close the bold or start some other formatting.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_~`|>])/g, '\\$1');
}

/**
 * The last line of every live pose message, random or custom. The member's
 * reply stops the clock, which is the intended outcome: an admin then sends
 * another pose. The struck-through replaced version does not carry it.
 */
export const ACCESSIBILITY_LINE =
  "If this one doesn't work for you, just let us know and we'll send another.";

function minutes(n: number): string {
  return n === 1 ? '1 minute' : `${n} minutes`;
}

export function poseMessage(
  targetId: string,
  pose: string,
  deadline: number,
  timeoutMinutes: number,
): string {
  return (
    `${user(targetId)} Here's your pose for the selfie: **${escapeMarkdown(pose)}**\n` +
    `Post it in this channel within ${minutes(timeoutMinutes)}, by ${shortTime(deadline)}.\n` +
    ACCESSIBILITY_LINE
  );
}

export function replacedPoseMessage(targetId: string, pose: string): string {
  return (
    `${user(targetId)} Here's your pose for the selfie: ~~**${escapeMarkdown(pose)}**~~\n` +
    'This pose was replaced. Use the one below.'
  );
}

export function expiryMessage(
  targetId: string,
  adminRoleId: string | undefined,
): string {
  return `${user(targetId)} That pose has expired. Tag ${admin(adminRoleId)} whenever you're ready and we'll send you a new one 💛`;
}

/**
 * The admin's ephemeral confirmation. It carries no deadline: the pose message
 * directly below it states one, and a relative timestamp here kept counting
 * after expiry, so it read "27 seconds ago" under a finished pose.
 */
export function poseConfirmation(
  targetId: string,
  pose: string,
  replaced: boolean,
): string {
  const lines = [
    `Posted a pose for ${user(targetId)}: **${escapeMarkdown(pose)}**`,
  ];
  if (replaced) {
    lines.push('This replaced the pose that was still live in this channel.');
  }
  return lines.join('\n');
}

export function poseSuperseded(targetId: string): string {
  return `${user(targetId)} already has a newer pose in this channel, so yours was struck through.`;
}

export function targetIsBot(targetId: string): string {
  return `${user(targetId)} is a bot, so no pose was posted.`;
}

export const NOT_IN_GUILD = 'This command only works in a server channel.';

export const CANNOT_SEND_HERE =
  "I can't post messages in this kind of channel, so no pose was posted and no timer was started.";

export function customTooLong(max: number): string {
  return `That custom pose is too long. Keep it to ${max} characters or fewer. No pose was posted.`;
}

interface ErrorLike {
  code?: unknown;
  message?: unknown;
}

/**
 * The admin cannot read the host's logs, so a failed send is explained where
 * they will see it: in the ephemeral reply to their own command.
 */
export function sendFailed(err: unknown): string {
  const { code, message } = (err ?? {}) as ErrorLike;
  if (code === 50013) {
    return "I couldn't post the pose because I'm missing a permission in this channel. I need View Channel, Send Messages and Read Message History here. No timer was started.";
  }
  if (code === 50001) {
    return "I couldn't post the pose because I can't see this channel. Give my role View Channel here. No timer was started.";
  }
  const detail = typeof message === 'string' && message ? message : String(err);
  return `I couldn't post the pose: ${detail.slice(0, 300)}. No timer was started.`;
}

export function commandFailed(detail: string): string {
  return `Something went wrong running that command.\n> ${detail.slice(0, 1500)}`;
}
