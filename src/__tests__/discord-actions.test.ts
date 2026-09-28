import { describe, expect, it, vi } from 'vitest';
import type { Client } from 'discord.js';
import { makeDiscordActions } from '../discord-actions';
import type { LivePose } from '../sessions';

const pose: LivePose = {
  channelId: 'chan-1',
  targetId: 'member-1',
  messageId: '1000',
  pose: 'Give a thumbs up.',
  deadline: 0,
};

function fakeClient(channel: unknown) {
  return {
    channels: { fetch: vi.fn(async () => channel) },
  } as unknown as Pick<Client, 'channels'>;
}

function fakeChannel() {
  return {
    isSendable: () => true,
    send: vi.fn(async () => ({ id: '2000' })),
    messages: { edit: vi.fn(async () => ({})) },
  };
}

describe('sendExpiry', () => {
  it('replies to the pose message, pinging only the target', async () => {
    const channel = fakeChannel();
    const actions = makeDiscordActions(fakeClient(channel), '456');
    await actions.sendExpiry(pose);
    expect(channel.send).toHaveBeenCalledWith({
      content: expect.stringContaining(
        '<@member-1> That pose has expired. Tag <@&456>',
      ),
      reply: { messageReference: '1000', failIfNotExists: false },
      allowedMentions: { parse: [], users: ['member-1'], repliedUser: false },
    });
  });

  it('writes "Tag an admin" when no role is configured', async () => {
    const channel = fakeChannel();
    await makeDiscordActions(fakeClient(channel), undefined).sendExpiry(pose);
    const payload = (channel.send.mock.calls[0] as unknown[])[0] as {
      content: string;
    };
    expect(payload.content).toContain('Tag an admin');
    expect(payload.content).not.toContain('<@&');
  });

  it('rejects when the channel is gone, for the session to catch', async () => {
    const actions = makeDiscordActions(fakeClient(null), undefined);
    await expect(actions.sendExpiry(pose)).rejects.toThrow(/unavailable/);
  });
});

describe('markReplaced', () => {
  it('edits the old pose message to strike it through, pinging only the target', async () => {
    const channel = fakeChannel();
    await makeDiscordActions(fakeClient(channel), undefined).markReplaced(pose);
    expect(channel.messages.edit).toHaveBeenCalledWith('1000', {
      content: expect.stringContaining('~~**Give a thumbs up.**~~'),
      allowedMentions: { parse: [], users: ['member-1'] },
    });
  });
});
