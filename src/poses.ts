import fs from 'fs';

/**
 * Keeps the assembled pose message well under Discord's 2000 character limit.
 * The same cap bounds the /pose custom option, so a custom pose and a listed
 * pose have the same budget. See the length budget test.
 */
export const MAX_POSE_LENGTH = 200;

function normalise(pose: string): string {
  return pose.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Validates the parsed contents of poses.json and returns the trimmed list.
 * Throws naming the first bad entry, by 1-based position, so the startup log
 * points straight at the line to fix.
 */
export function validatePoses(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new Error('poses.json must be a JSON array of strings');
  }
  if (raw.length === 0) {
    throw new Error('poses.json is empty. It needs at least one pose');
  }

  const poses: string[] = [];
  const firstSeen = new Map<string, number>();

  raw.forEach((entry: unknown, index) => {
    const position = index + 1;
    if (typeof entry !== 'string') {
      throw new Error(`poses.json entry ${position} is not a string`);
    }
    const pose = entry.trim();
    if (pose.length === 0) {
      throw new Error(`poses.json entry ${position} is blank`);
    }
    if (pose.length > MAX_POSE_LENGTH) {
      throw new Error(
        `poses.json entry ${position} is ${pose.length} characters, over the ${MAX_POSE_LENGTH} character cap: "${pose.slice(0, 40)}..."`,
      );
    }
    const key = normalise(pose);
    const earlier = firstSeen.get(key);
    if (earlier !== undefined) {
      throw new Error(
        `poses.json entry ${position} duplicates entry ${earlier}: "${pose}"`,
      );
    }
    firstSeen.set(key, position);
    poses.push(pose);
  });

  return poses;
}

export function loadPoses(filePath: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read poses from ${filePath}: ${reason}`, {
      cause: err,
    });
  }
  return validatePoses(raw);
}

/**
 * Picks a random pose that is not the one last issued in the channel. With a
 * one-pose list there is nothing else to pick, so the only pose repeats.
 */
export function pickPose(
  poses: readonly string[],
  previous: string | undefined,
  random: () => number,
): string {
  const candidates =
    poses.length > 1 ? poses.filter((pose) => pose !== previous) : poses;
  const index = Math.min(
    Math.floor(random() * candidates.length),
    candidates.length - 1,
  );
  return candidates[index];
}
