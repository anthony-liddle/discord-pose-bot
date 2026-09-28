import path from 'path';
import 'dotenv/config';
import { wireBot } from './bot';
import { createClient } from './client';
import { loadBotConfig } from './config';
import { makeDiscordActions } from './discord-actions';
import { logEvent } from './log';
import { loadPoses } from './poses';
import { handlePose } from './pose-command';
import { createPoseSessions, errorCode } from './sessions';

// Compiled to dist/src/index.js, so the repo root, where poses.json ships, is
// two levels up. Same in the image: /app/dist/src and /app/poses.json.
const POSES_PATH = path.join(__dirname, '..', '..', 'poses.json');

let config: ReturnType<typeof loadBotConfig>;
let poses: string[];
try {
  config = loadBotConfig(process.env);
  poses = loadPoses(POSES_PATH);
} catch (err) {
  console.error(
    `Refusing to start: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}

const client = createClient();
const actions = makeDiscordActions(client, config.adminRoleId);
const timeoutMs = config.timeoutMinutes * 60 * 1000;

const sessions = createPoseSessions({
  scheduler: {
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
  },
  now: () => Date.now(),
  sendExpiry: actions.sendExpiry,
  markReplaced: actions.markReplaced,
  log: logEvent,
});

wireBot(client, {
  sessions,
  log: logEvent,
  handlePose: (interaction) =>
    handlePose(interaction, {
      sessions,
      poses,
      random: Math.random,
      now: () => Date.now(),
      timeoutMs,
      log: logEvent,
    }),
});

client.once('clientReady', (ready) => {
  logEvent('ready', { userId: ready.user.id });
  console.log(
    `Loaded ${poses.length} poses. Timeout ${config.timeoutMinutes} minutes.`,
  );
});

// The handler boundary cannot see a promise nobody awaited. Without this a
// single floating rejection takes the process down, and every live timer with
// it. Logs the code only: a rejection reason can carry message text.
process.on('unhandledRejection', (reason) => {
  logEvent('unhandled_rejection', {}, errorCode(reason));
});

async function shutdown(): Promise<void> {
  logEvent('shutdown', {});
  await client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(config.token).catch((err: unknown) => {
  logEvent('login_failed', {}, errorCode(err));
  process.exit(1);
});
