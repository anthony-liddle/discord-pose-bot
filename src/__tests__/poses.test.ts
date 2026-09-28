import path from 'path';
import { describe, expect, it } from 'vitest';
import { MAX_POSE_LENGTH, loadPoses, pickPose, validatePoses } from '../poses';

describe('validatePoses', () => {
  it('accepts a list of distinct non-blank sentences', () => {
    expect(validatePoses(['Touch your nose.', 'Close one eye.'])).toEqual([
      'Touch your nose.',
      'Close one eye.',
    ]);
  });

  it('rejects something that is not an array', () => {
    expect(() => validatePoses({ pose: 'Touch your nose.' })).toThrow(
      /must be a JSON array/,
    );
  });

  it('rejects an empty array', () => {
    expect(() => validatePoses([])).toThrow(/is empty/);
  });

  it('rejects a non-string entry and names its position', () => {
    expect(() => validatePoses(['Touch your nose.', 42])).toThrow(
      /entry 2 is not a string/,
    );
  });

  it('rejects a blank entry and names its position', () => {
    expect(() => validatePoses(['Touch your nose.', '   '])).toThrow(
      /entry 2 is blank/,
    );
  });

  it('rejects a duplicate and names both the entry and the text', () => {
    expect(() =>
      validatePoses(['Touch your nose.', 'Close one eye.', 'Touch your nose.']),
    ).toThrow(/entry 3 duplicates entry 1: "Touch your nose\."/);
  });

  it('treats duplicates that differ only by case or spacing as duplicates', () => {
    expect(() =>
      validatePoses(['Touch your nose.', '  touch your  NOSE. ']),
    ).toThrow(/entry 2 duplicates entry 1/);
  });

  it('rejects an overlong entry and names it', () => {
    const long = 'a'.repeat(MAX_POSE_LENGTH + 1);
    expect(() => validatePoses(['Touch your nose.', long])).toThrow(
      new RegExp(`entry 2 is ${MAX_POSE_LENGTH + 1} characters`),
    );
  });

  it('accepts an entry exactly at the cap', () => {
    const atCap = 'a'.repeat(MAX_POSE_LENGTH);
    expect(validatePoses([atCap])).toEqual([atCap]);
  });

  it('trims surrounding whitespace from entries', () => {
    expect(validatePoses(['  Touch your nose.  '])).toEqual([
      'Touch your nose.',
    ]);
  });
});

describe('the shipped poses.json', () => {
  it('passes the same validation the bot runs at startup', () => {
    const poses = loadPoses(path.join(__dirname, '..', '..', 'poses.json'));
    // The admin team owns the list. The floor only catches a list that was
    // truncated by accident, not a judgement on how many poses is enough.
    expect(poses.length).toBeGreaterThanOrEqual(10);
  });

  it('never says "left" or "right", because front cameras mirror', () => {
    const poses = loadPoses(path.join(__dirname, '..', '..', 'poses.json'));
    const offenders = poses.filter((pose) => /\b(left|right)\b/i.test(pose));
    expect(offenders).toEqual([]);
  });
});

describe('the left or right check', () => {
  // Proves the pattern above matches whole words only, in any case.
  const sides = /\b(left|right)\b/i;

  it('matches the words in any case', () => {
    expect(sides.test('Raise your Left hand.')).toBe(true);
    expect(sides.test('Tilt to the RIGHT.')).toBe(true);
  });

  it('does not match them inside other words', () => {
    expect(sides.test('Squint into bright sun.')).toBe(false);
    expect(sides.test('Stand upright.')).toBe(false);
  });
});

describe('loadPoses', () => {
  it('names the file when it is not valid JSON', () => {
    expect(() => loadPoses(path.join(__dirname, 'poses.test.ts'))).toThrow(
      /poses\.test\.ts/,
    );
  });
});

describe('pickPose', () => {
  const poses = ['A.', 'B.', 'C.'];

  it('never returns the previous pose for the channel, across every random value', () => {
    for (let i = 0; i < 1000; i++) {
      const r = i / 1000;
      expect(pickPose(poses, 'B.', () => r)).not.toBe('B.');
    }
  });

  it('can still return every other pose', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(pickPose(poses, 'B.', () => i / 100));
    }
    expect([...seen].sort()).toEqual(['A.', 'C.']);
  });

  it('picks from the whole list when there is no previous pose', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(pickPose(poses, undefined, () => i / 100));
    }
    expect([...seen].sort()).toEqual(['A.', 'B.', 'C.']);
  });

  it('picks from the whole list when the previous pose was custom text', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(pickPose(poses, 'Something custom.', () => i / 100));
    }
    expect([...seen].sort()).toEqual(['A.', 'B.', 'C.']);
  });

  it('still works with a one-pose list, repeating the only pose', () => {
    expect(pickPose(['Only.'], 'Only.', () => 0.5)).toBe('Only.');
    expect(pickPose(['Only.'], undefined, () => 0.99)).toBe('Only.');
  });

  it('stays in range when the random source returns its upper edge', () => {
    expect(poses).toContain(pickPose(poses, undefined, () => 0.9999999999));
    expect(poses).toContain(pickPose(poses, 'A.', () => 0.9999999999));
  });
});
