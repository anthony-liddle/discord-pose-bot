import type { Client } from 'discord.js';
import * as copy from './copy';
import type { LivePose } from './sessions';

/**
 * The two things the session module asks Discord to do, as thin wrappers.
 * Both reject on failure; the session module catches and logs.
 */
export function makeDiscordActions(
  client: Pick<Client, 'channels'>,
  adminRoleId: string | undefined,
) {
  async function channelFor(channelId: string) {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable() || !('messages' in channel)) {
      throw Object.assign(new Error('Channel unavailable'), {
        code: 'channel_unavailable',
      });
    }
    return channel;
  }

  return {
    async sendExpiry(pose: LivePose): Promise<void> {
      const channel = await channelFor(pose.channelId);
      await channel.send({
        content: copy.expiryMessage(pose.targetId, adminRoleId),
        // If the pose message was deleted, send as a plain message rather than
        // failing: the member still needs to know the pose expired.
        reply: { messageReference: pose.messageId, failIfNotExists: false },
        allowedMentions: {
          parse: [],
          users: [pose.targetId],
          repliedUser: false,
        },
      });
    },

    async markReplaced(pose: LivePose): Promise<void> {
      const channel = await channelFor(pose.channelId);
      await channel.messages.edit(pose.messageId, {
        content: copy.replacedPoseMessage(pose.targetId, pose.pose),
        // An edit without allowed_mentions is re-parsed with default
        // allowances, so it is repeated here.
        allowedMentions: { parse: [], users: [pose.targetId] },
      });
    },
  };
}
