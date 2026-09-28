import { EventEmitter } from 'events';
import { WebSocketShard } from 'discord.js';
import type { Client } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wireBot } from '../bot';
import { createClient } from '../client';

let client: Client | undefined;

afterEach(async () => {
  await client?.destroy();
  client = undefined;
});

/**
 * The client production builds, with discord.js's own gateway close handling
 * (WebSocketManager#attachEvents) attached to a stand-in for the @discordjs/ws
 * manager. Emitting 'closed' on the stand-in runs the real code that decides
 * between shardDisconnect and shardReconnecting. No connection is opened.
 */
function realClientWithGateway() {
  const c = createClient();
  const ws = c.ws as unknown as {
    _ws: EventEmitter | null;
    shards: Map<number, unknown>;
    attachEvents(): void;
  };
  const fakeWs = new EventEmitter();
  ws._ws = fakeWs;
  ws.shards.set(
    0,
    new (WebSocketShard as unknown as new (m: unknown, id: number) => unknown)(
      c.ws,
      0,
    ),
  );
  ws.attachEvents();
  const exit = vi.fn();
  const log = vi.fn();
  wireBot(c, {
    sessions: {
      issue: vi.fn(),
      handleMessage: vi.fn(),
      handleChannelDelete: vi.fn(),
      lastPose: vi.fn(),
      isLive: vi.fn(),
    },
    handlePose: vi.fn(),
    log,
    exit,
  });
  const close = (code: number) => fakeWs.emit('closed', { code, shardId: 0 });
  // Detach the stand-in so afterEach's destroy() has nothing to close.
  const detach = () => {
    ws._ws = null;
  };
  return { client: c, close, exit, log, detach };
}

describe('an unrecoverable gateway close', () => {
  it.each([4004, 4010, 4011, 4012, 4013, 4014])(
    'exits 1 on close code %i and logs only the code',
    (code) => {
      const g = realClientWithGateway();
      client = g.client;
      let disconnected = false;
      g.client.on('shardDisconnect', () => (disconnected = true));

      g.close(code);
      g.detach();

      // Prove the fixture drove discord.js's real handler before trusting it.
      expect(disconnected).toBe(true);
      expect(g.log).toHaveBeenCalledWith('shard_disconnect', {}, String(code));
      expect(g.exit).toHaveBeenCalledTimes(1);
      expect(g.exit).toHaveBeenCalledWith(1);
    },
  );
});

describe('closes that do not end the process', () => {
  it.each([4000, 4007, 4009, 1001])(
    'does not exit on recoverable close code %i, which reconnects',
    (code) => {
      const g = realClientWithGateway();
      client = g.client;
      let reconnecting = false;
      g.client.on('shardReconnecting', () => (reconnecting = true));

      g.close(code);
      g.detach();

      expect(reconnecting).toBe(true);
      expect(g.exit).not.toHaveBeenCalled();
    },
  );

  it('does not exit on code 1000, the close our own client.destroy() sends', () => {
    // client.destroy() calls the @discordjs/ws manager's destroy with code
    // 1000 (Normal), which emits 'closed' with that code. discord.js routes
    // it to shardReconnecting, so SIGTERM and SIGINT still exit 0.
    const g = realClientWithGateway();
    client = g.client;
    let disconnected = false;
    g.client.on('shardDisconnect', () => (disconnected = true));

    g.close(1000);
    g.detach();

    expect(disconnected).toBe(false);
    expect(g.exit).not.toHaveBeenCalled();
  });
});
