import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, Message } from 'discord.js';
import * as copy from './copy';
import { MAX_POSE_LENGTH, pickPose } from './poses';
import { errorCode, type LogEvent, type PoseSessions } from './sessions';

export interface PoseCommandDeps {
  sessions: PoseSessions;
  poses: readonly string[];
  random: () => number;
  now: () => number;
  /** POSE_TIMEOUT_MINUTES. Sets the deadline and is named in the message. */
  timeoutMinutes: number;
  /**
   * ADMIN_ROLE_ID. The pose message asks the member to tag this role, so the
   * ping comes from the member's own tag, never from the bot.
   */
  adminRoleId: string | undefined;
  log: LogEvent;
}

/**
 * /pose user:<member> custom:<optional text>
 *
 * Every outcome, including failure, ends in the ephemeral reply, because that
 * is the only place the invoking admin will ever see it.
 */
export async function handlePose(
  interaction: ChatInputCommandInteraction,
  deps: PoseCommandDeps,
): Promise<void> {
  // First, before anything that could take time or throw: the 3 second
  // acknowledgement window is the one failure the admin sees nothing for.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const reply = (content: string) =>
    interaction.editReply({ content, allowedMentions: { parse: [] } });

  const target = interaction.options.getUser('user', true);
  const channelId = interaction.channelId;
  const ids = { channelId, userId: target.id };

  if (!interaction.inGuild()) {
    await reply(copy.NOT_IN_GUILD);
    return;
  }

  if (target.bot) {
    deps.log('pose_refused_bot_target', ids);
    await reply(copy.targetIsBot(target.id));
    return;
  }

  const custom = interaction.options.getString('custom')?.trim() || undefined;
  if (custom && custom.length > MAX_POSE_LENGTH) {
    await reply(copy.customTooLong(MAX_POSE_LENGTH));
    return;
  }

  const channel =
    interaction.channel ?? (await interaction.client.channels.fetch(channelId));
  if (!channel?.isSendable()) {
    await reply(copy.CANNOT_SEND_HERE);
    return;
  }

  const pose =
    custom ??
    pickPose(deps.poses, deps.sessions.lastPose(channelId), deps.random);
  const deadline = deps.now() + deps.timeoutMinutes * 60 * 1000;

  let message: Pick<Message, 'id'>;
  try {
    message = await channel.send({
      content: copy.poseMessage(
        target.id,
        pose,
        deadline,
        deps.timeoutMinutes,
        deps.adminRoleId,
      ),
      // The member only. The Admin role still renders as a pill to tag.
      allowedMentions: { parse: [], users: [target.id] },
    });
  } catch (err) {
    // Nothing is armed and any older live pose is left exactly as it was.
    deps.log('pose_send_failed', ids, errorCode(err));
    await reply(copy.sendFailed(err));
    return;
  }

  const { replaced, superseded } = deps.sessions.issue({
    channelId,
    targetId: target.id,
    messageId: message.id,
    pose,
    deadline,
  });

  if (superseded) {
    // Another admin's newer pose landed first. This one was struck through
    // and no timer runs for it, so a normal confirmation would be wrong.
    await reply(copy.poseSuperseded(target.id));
    return;
  }
  await reply(copy.poseConfirmation(target.id, pose, replaced));
}
