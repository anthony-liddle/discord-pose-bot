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

/** Live relative time. "in 5 minutes", later "10 minutes ago". */
function relativeTime(ms: number): string {
  return `<t:${unixSeconds(ms)}:R>`;
}

function user(id: string): string {
  return `<@${id}>`;
}

/**
 * Custom poses are admin-typed free text. Escape the characters that would
 * otherwise close the bold or start some other formatting.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_~`|>])/g, '\\$1');
}

export function poseMessage(
  targetId: string,
  pose: string,
  deadline: number,
): string {
  return (
    `${user(targetId)} Here's your pose for the selfie: **${escapeMarkdown(pose)}**\n` +
    `Post it in this channel by ${shortTime(deadline)} (${relativeTime(deadline)}).`
  );
}

export function replacedPoseMessage(targetId: string, pose: string): string {
  return (
    `${user(targetId)} Here's your pose for the selfie: ~~**${escapeMarkdown(pose)}**~~\n` +
    `A newer pose replaced this one. Use the newest pose instead.`
  );
}

export function expiryMessage(
  targetId: string,
  adminRoleId: string | undefined,
): string {
  const who = adminRoleId ? `Tag <@&${adminRoleId}>` : 'Tag an admin';
  return `${user(targetId)} That pose has expired. ${who} whenever you're ready and we'll send you a new one 💛`;
}

export function poseConfirmation(
  targetId: string,
  pose: string,
  deadline: number,
  replaced: boolean,
): string {
  const lines = [
    `Posted a pose for ${user(targetId)}: **${escapeMarkdown(pose)}**`,
    `It expires ${relativeTime(deadline)} unless they post in this channel first.`,
  ];
  if (replaced) {
    lines.push('This replaced the pose that was still live in this channel.');
  }
  return lines.join('\n');
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
