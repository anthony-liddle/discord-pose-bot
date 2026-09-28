export interface LogFields {
  channelId?: string;
  userId?: string;
}

/**
 * The only logger. Event type, channel ID and user ID, plus at most a Discord
 * error code. Never message content, never error objects: those can carry
 * text from a ticket channel.
 */
export function logEvent(event: string, ids: LogFields, code?: string): void {
  const parts = [`event=${event}`];
  if (ids.channelId) parts.push(`channel=${ids.channelId}`);
  if (ids.userId) parts.push(`user=${ids.userId}`);
  if (code) parts.push(`code=${code}`);
  console.log(parts.join(' '));
}
