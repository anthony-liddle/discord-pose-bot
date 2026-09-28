import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logEvent } from '../log';

let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// log.ts is the privacy choke point. These tests run the real logger and pin
// its exact output, so the README's claim about what logs contain is enforced
// here rather than by a mock.
describe('logEvent output', () => {
  it('prints the event alone', () => {
    logEvent('ready', {});
    expect(lines).toEqual(['event=ready']);
  });

  it('prints the event and a code', () => {
    logEvent('shard_disconnect', {}, '4004');
    expect(lines).toEqual(['event=shard_disconnect code=4004']);
  });

  it('prints channel and user', () => {
    logEvent('pose_issued', { channelId: '10', userId: '20' });
    expect(lines).toEqual(['event=pose_issued channel=10 user=20']);
  });

  it('prints channel, user and code', () => {
    logEvent('pose_send_failed', { channelId: '10', userId: '20' }, '50013');
    expect(lines).toEqual([
      'event=pose_send_failed channel=10 user=20 code=50013',
    ]);
  });

  it('prints the handler name', () => {
    logEvent('handler_error', { handler: 'messageCreate' });
    expect(lines).toEqual(['event=handler_error handler=messageCreate']);
  });

  it('prints every field in a fixed order', () => {
    logEvent(
      'handler_error',
      { handler: 'interactionCreate', channelId: '10', userId: '20' },
      '50035',
    );
    expect(lines).toEqual([
      'event=handler_error handler=interactionCreate channel=10 user=20 code=50035',
    ]);
  });

  it('prints nothing it was not built to print, whatever it is handed', () => {
    const smuggled = {
      channelId: '10',
      content: 'here is my ID',
      attachments: ['https://cdn.discordapp.com/attachments/1/2/id.png'],
      message: { content: 'nested' },
      event: 'messageCreate',
    };
    logEvent('pose_answered', smuggled as never, undefined);
    expect(lines).toEqual(['event=pose_answered channel=10']);
    expect(lines.join('\n')).not.toMatch(/ID|cdn|nested|messageCreate/);
  });

  it('writes exactly one line per call', () => {
    logEvent('a', {});
    logEvent('b', { userId: '1' });
    expect(lines).toHaveLength(2);
  });
});
