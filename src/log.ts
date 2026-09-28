export interface LogFields {
  /** The event handler that failed, for handler_error lines. */
  handler?: string;
  channelId?: string;
  userId?: string;
}

/**
 * The only logger. Event type, plus at most the failing handler's name, a
 * channel ID, a user ID and a Discord error code. Never message content,
 * never error objects: those can carry text from a ticket channel.
 */
export function logEvent(event: string, ids: LogFields, code?: string): void {
  // Each field is read by name. Anything else on the object, whatever a
  // caller passes through a cast, is never printed.
  const parts = [`event=${event}`];
  if (ids.handler) parts.push(`handler=${ids.handler}`);
  if (ids.channelId) parts.push(`channel=${ids.channelId}`);
  if (ids.userId) parts.push(`user=${ids.userId}`);
  if (code) parts.push(`code=${code}`);
  console.log(parts.join(' '));
}
