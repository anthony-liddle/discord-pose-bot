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
  timeoutMs: number;
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
  const deadline = deps.now() + deps.timeoutMs;

  let message: Pick<Message, 'id'>;
  try {
    message = await channel.send({
      content: copy.poseMessage(target.id, pose, deadline),
      allowedMentions: { parse: [], users: [target.id] },
    });
  } catch (err) {
    // Nothing is armed and any older live pose is left exactly as it was.
    deps.log('pose_send_failed', ids, errorCode(err));
    await reply(copy.sendFailed(err));
    return;
  }

  const { replaced } = deps.sessions.issue({
    channelId,
    targetId: target.id,
    messageId: message.id,
    pose,
    deadline,
  });

  await reply(copy.poseConfirmation(target.id, pose, deadline, replaced));
}
