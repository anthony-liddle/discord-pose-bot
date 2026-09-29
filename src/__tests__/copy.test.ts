import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import * as copy from '../copy';
import { MAX_POSE_LENGTH } from '../poses';

const EM_DASH = String.fromCharCode(0x2014);
const ROOT = path.join(__dirname, '..', '..');

// Snowflakes are 64-bit, so 20 digits is the longest an ID can render as.
const LONGEST_ID = '1'.repeat(20);
// Far-future deadline, so the timestamp renders with as many digits as it can
// plausibly reach.
const FAR_DEADLINE = Date.UTC(2999, 0, 1);

describe('pose message', () => {
  it('pings the member, bolds the pose, states the window and a fixed deadline, and closes on the accessibility line', () => {
    const deadline = Date.UTC(2026, 8, 28, 22, 45, 0);
    const seconds = deadline / 1000;
    expect(copy.poseMessage('123', 'Give a thumbs up.', deadline, 5)).toBe(
      `<@123> Here's your pose for the selfie: **Give a thumbs up.**\n` +
        `Post it in this channel within 5 minutes, by <t:${seconds}:t>.\n` +
        `If this one doesn't work for you, just let us know and we'll send another.`,
    );
  });

  it('says "1 minute", singular, when the window is one minute', () => {
    const deadline = Date.UTC(2026, 8, 28, 22, 45, 0);
    const seconds = deadline / 1000;
    expect(copy.poseMessage('123', 'Give a thumbs up.', deadline, 1)).toBe(
      `<@123> Here's your pose for the selfie: **Give a thumbs up.**\n` +
        `Post it in this channel within 1 minute, by <t:${seconds}:t>.\n` +
        `If this one doesn't work for you, just let us know and we'll send another.`,
    );
  });

  it('carries no relative timestamp, which would count up after expiry', () => {
    for (const minutes of [1, 5, 60]) {
      expect(copy.poseMessage('1', 'X.', 1000, minutes)).not.toContain(':R>');
    }
  });

  it('ends every pose message, random or custom, on the accessibility line', () => {
    for (const pose of ['Touch your nose with one finger.', 'Wave **twice**']) {
      const lines = copy.poseMessage('1', pose, 1000, 5).split('\n');
      expect(lines[lines.length - 1]).toBe(copy.ACCESSIBILITY_LINE);
      expect(lines[lines.length - 1]).toBe(
        "If this one doesn't work for you, just let us know and we'll send another.",
      );
    }
  });

  it('rounds a deadline with milliseconds up to the next whole second', () => {
    expect(copy.poseMessage('1', 'X.', 1_000_500, 5)).toContain('<t:1001:t>');
  });

  it('escapes markdown in a custom pose so it cannot break the bold', () => {
    const text = copy.poseMessage('1', 'Hold **two** fingers_up', 1000, 5);
    expect(text).toContain('**Hold \\*\\*two\\*\\* fingers\\_up**');
  });
});

describe('replaced pose message', () => {
  it('strikes through the pose and points at the one below', () => {
    expect(copy.replacedPoseMessage('123', 'Give a thumbs up.')).toBe(
      "<@123> Here's your pose for the selfie: ~~**Give a thumbs up.**~~\n" +
        'This pose was replaced. Use the one below.',
    );
  });

  it('does not carry the accessibility line', () => {
    expect(copy.replacedPoseMessage('123', 'Give a thumbs up.')).not.toContain(
      copy.ACCESSIBILITY_LINE,
    );
  });
});

describe('superseded pose reply', () => {
  it('tells the admin the member already has a newer pose', () => {
    expect(copy.poseSuperseded('123')).toBe(
      '<@123> already has a newer pose in this channel, so yours was struck through.',
    );
  });
});

describe('expiry message', () => {
  it('names the Admin role by mention when one is configured', () => {
    expect(copy.expiryMessage('123', '456')).toBe(
      "<@123> That pose has expired. Tag <@&456> whenever you're ready and we'll send you a new one 💛",
    );
  });

  it('says "Tag an admin" in plain text when no role is configured', () => {
    expect(copy.expiryMessage('123', undefined)).toBe(
      "<@123> That pose has expired. Tag an admin whenever you're ready and we'll send you a new one 💛",
    );
  });
});

describe('send failure description', () => {
  it('explains a missing permission in plain words', () => {
    const text = copy.sendFailed({
      code: 50013,
      message: 'Missing Permissions',
    });
    expect(text).toMatch(/missing a permission in this channel/);
    expect(text).toMatch(/No timer was started/);
  });

  it('explains missing access in plain words', () => {
    expect(copy.sendFailed({ code: 50001 })).toMatch(/can't see this channel/);
  });

  it('falls back to the error text for anything else', () => {
    expect(copy.sendFailed(new Error('socket hang up'))).toMatch(
      /socket hang up.*No timer was started/s,
    );
  });
});

describe('length budget', () => {
  // Every piece is individually bounded. This checks they still fit once
  // assembled, which is where a per-piece budget can quietly sum past the
  // global 2000 character limit.
  const worstPose = '*'.repeat(MAX_POSE_LENGTH); // every character escaped

  it('keeps the longest possible pose message well under 2000', () => {
    const text = copy.poseMessage(LONGEST_ID, worstPose, FAR_DEADLINE, 60);
    expect(text.length).toBeLessThan(1000);
  });

  it('keeps the longest possible replaced message well under 2000', () => {
    expect(copy.replacedPoseMessage(LONGEST_ID, worstPose).length).toBeLessThan(
      1000,
    );
  });

  it('keeps the expiry message and admin confirmations well under 2000', () => {
    expect(copy.expiryMessage(LONGEST_ID, LONGEST_ID).length).toBeLessThan(
      1000,
    );
    expect(
      copy.poseConfirmation(LONGEST_ID, worstPose, FAR_DEADLINE, true).length,
    ).toBeLessThan(1000);
  });
});

describe('no em dashes', () => {
  function everyString(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (typeof value === 'function') {
      // Call each formatter with long, plausible arguments so the static text
      // around the interpolations is exercised.
      const out = (value as (...args: unknown[]) => unknown)(
        LONGEST_ID,
        'Give a thumbs up.',
        FAR_DEADLINE,
        true,
      );
      return typeof out === 'string' ? [out] : [];
    }
    return [];
  }

  it('appears in no user-facing string', () => {
    const strings = Object.values(copy).flatMap(everyString);
    expect(strings.length).toBeGreaterThan(5);
    for (const text of strings) {
      expect(text).not.toContain(EM_DASH);
    }
  });

  it('appears in no entry of poses.json', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'poses.json'), 'utf8');
    expect(raw).not.toContain(EM_DASH);
  });

  it('appears in no source, config or documentation file in the repo', () => {
    const skip = new Set(['node_modules', 'dist', '.git', 'coverage']);
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          /\.(ts|js|json|md|toml|ya?ml|example)$|Dockerfile$/.test(entry.name)
        ) {
          if (entry.name === 'pnpm-lock.yaml') continue;
          if (fs.readFileSync(full, 'utf8').includes(EM_DASH)) {
            offenders.push(path.relative(ROOT, full));
          }
        }
      }
    };
    walk(ROOT);
    expect(offenders).toEqual([]);
  });
});
