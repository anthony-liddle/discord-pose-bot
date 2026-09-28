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

  // Every combination of the four optional fields, 16 in all. The expected
  // line is built independently from the fixed order: event, handler,
  // channel, user, code.
  const fields = [
    { key: 'handler', label: 'handler', value: 'messageCreate' },
    { key: 'channelId', label: 'channel', value: '10' },
    { key: 'userId', label: 'user', value: '20' },
    { key: 'code', label: 'code', value: '50013' },
  ] as const;
  const subsets = Array.from({ length: 16 }, (_, mask) =>
    fields.filter((_, bit) => mask & (1 << bit)),
  );

  it.each(
    subsets.map(
      (subset) =>
        [subset.map((f) => f.label).join('+') || 'none', subset] as const,
    ),
  )('prints exactly the fields given: %s', (_name, subset) => {
    const ids: Record<string, string> = {};
    let code: string | undefined;
    for (const f of subset) {
      if (f.key === 'code') code = f.value;
      else ids[f.key] = f.value;
    }
    logEvent('e', ids, code);
    const expected = ['event=e', ...subset.map((f) => `${f.label}=${f.value}`)];
    expect(lines).toEqual([expected.join(' ')]);
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
