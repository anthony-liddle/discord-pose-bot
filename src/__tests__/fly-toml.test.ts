import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const FLY_TOML = path.join(__dirname, '..', '..', 'fly.toml');

/**
 * The bot listens on no port. With an HTTP service defined, Fly's proxy sees
 * an idle machine, stops it, and never starts it again, because auto-start
 * only fires on inbound HTTP. The live timer dies with the machine and /pose
 * answers "The application did not respond". `fly launch` adds exactly that
 * block whenever it is allowed to rewrite fly.toml. A line check is enough
 * here; a TOML parser would be a dependency for one assertion.
 */
function configLines(): string[] {
  return fs
    .readFileSync(FLY_TOML, 'utf8')
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.length > 0);
}

describe('fly.toml', () => {
  it('defines no [http_service]', () => {
    expect(configLines()).not.toContain('[http_service]');
  });

  it('defines no [[services]]', () => {
    expect(configLines()).not.toContain('[[services]]');
  });

  it('never sets auto_stop_machines', () => {
    const offenders = configLines().filter((line) =>
      line.includes('auto_stop_machines'),
    );
    expect(offenders).toEqual([]);
  });
});
