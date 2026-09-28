import { MessageFlags } from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Client,
  Interaction,
} from 'discord.js';
import * as copy from './copy';
import { POSE_COMMAND } from './command';
import type { LogFields } from './log';
import { errorCode, type PoseSessions } from './sessions';

export interface BotDeps {
  sessions: PoseSessions;
  handlePose: (interaction: ChatInputCommandInteraction) => Promise<void>;
  log: (event: string, ids: LogFields, code?: string) => void;
}

/** Shown to the admin only, in their ephemeral reply. Never logged. */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.constructor?.name ?? 'Error'}: ${err.message || String(err)}`;
  }
  return String(err);
}

/**
 * Wraps an event handler so neither a synchronous throw nor a rejection can
 * escape into discord.js or the process.
 */
function guarded<A extends unknown[]>(
  deps: BotDeps,
  event: string,
  handler: (...args: A) => unknown,
  onError?: (err: unknown, ...args: A) => Promise<void>,
): (...args: A) => void {
  const fail = (err: unknown, args: A): void => {
    if (onError) {
      onError(err, ...args).catch(() => {
        deps.log('handler_error', { handler: event }, errorCode(err));
      });
    } else {
      deps.log('handler_error', { handler: event }, errorCode(err));
    }
  };
  return (...args: A) => {
    try {
      Promise.resolve(handler(...args)).catch((err: unknown) =>
        fail(err, args),
      );
    } catch (err) {
      fail(err, args);
    }
  };
}

export function wireBot(client: Client, deps: BotDeps): void {
  const { sessions, log } = deps;

  client.on(
    'interactionCreate',
    guarded(
      deps,
      'interactionCreate',
      async (interaction: Interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (interaction.commandName !== POSE_COMMAND) return;
        await deps.handlePose(interaction);
      },
      async (err, interaction) => {
        const ids = {
          channelId: interaction.channelId ?? undefined,
          userId: interaction.user?.id,
        };
        log(
          'handler_error',
          { handler: 'interactionCreate', ...ids },
          errorCode(err),
        );
        if (!interaction.isRepliable()) return;
        // The admin cannot read the host's logs. Errors go in-band.
        const payload = {
          content: copy.commandFailed(describeError(err)),
          flags: MessageFlags.Ephemeral as const,
          allowedMentions: { parse: [] },
        };
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
          } else {
            await interaction.reply(payload);
          }
        } catch (reportErr) {
          log('error_report_failed', ids, errorCode(reportErr));
        }
      },
    ),
  );

  client.on(
    'messageCreate',
    guarded(deps, 'messageCreate', (message) => {
      if (!message.inGuild()) return;
      // Without Message Content the text and attachments arrive empty. The
      // author and IDs are all this needs.
      sessions.handleMessage({
        channelId: message.channelId,
        authorId: message.author.id,
        messageId: message.id,
      });
    }),
  );

  client.on(
    'channelDelete',
    guarded(deps, 'channelDelete', (channel) => {
      sessions.handleChannelDelete(channel.id);
    }),
  );

  client.on(
    'threadDelete',
    guarded(deps, 'threadDelete', (thread) => {
      sessions.handleChannelDelete(thread.id);
    }),
  );

  // An EventEmitter 'error' with no listener throws, which would take the
  // process down.
  client.on('error', (err) => {
    log('client_error', {}, errorCode(err));
  });
}
