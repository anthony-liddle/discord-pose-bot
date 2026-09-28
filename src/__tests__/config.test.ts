import { describe, expect, it } from 'vitest';
import { loadBotConfig, loadRegisterConfig } from '../config';

const base = { DISCORD_TOKEN: 'token' };

describe('loadBotConfig', () => {
  it('defaults the timeout to 5 minutes and the admin role to unset', () => {
    expect(loadBotConfig(base)).toEqual({
      token: 'token',
      adminRoleId: undefined,
      timeoutMinutes: 5,
    });
  });

  it('requires DISCORD_TOKEN', () => {
    expect(() => loadBotConfig({})).toThrow(/DISCORD_TOKEN/);
  });

  it('treats a blank ADMIN_ROLE_ID as unset', () => {
    expect(loadBotConfig({ ...base, ADMIN_ROLE_ID: '  ' }).adminRoleId).toBe(
      undefined,
    );
  });

  it('accepts a snowflake ADMIN_ROLE_ID', () => {
    expect(
      loadBotConfig({ ...base, ADMIN_ROLE_ID: '123456789012345678' })
        .adminRoleId,
    ).toBe('123456789012345678');
  });

  it('rejects an ADMIN_ROLE_ID that is not a snowflake', () => {
    expect(() => loadBotConfig({ ...base, ADMIN_ROLE_ID: '@Admin' })).toThrow(
      /ADMIN_ROLE_ID/,
    );
  });

  it.each(['1', '5', '60'])('accepts POSE_TIMEOUT_MINUTES=%s', (value) => {
    expect(
      loadBotConfig({ ...base, POSE_TIMEOUT_MINUTES: value }).timeoutMinutes,
    ).toBe(Number(value));
  });

  it.each(['0', '-1', '61', '2.5', 'five', '5m', ' '])(
    'rejects POSE_TIMEOUT_MINUTES=%j',
    (value) => {
      if (value.trim() === '') {
        // Blank means unset, so it takes the default.
        expect(
          loadBotConfig({ ...base, POSE_TIMEOUT_MINUTES: value })
            .timeoutMinutes,
        ).toBe(5);
        return;
      }
      expect(() =>
        loadBotConfig({ ...base, POSE_TIMEOUT_MINUTES: value }),
      ).toThrow(/POSE_TIMEOUT_MINUTES/);
    },
  );
});

describe('loadRegisterConfig', () => {
  it('requires token, client ID and guild ID', () => {
    expect(() =>
      loadRegisterConfig({ DISCORD_TOKEN: 't', CLIENT_ID: '1' }),
    ).toThrow(/GUILD_ID/);
    expect(() =>
      loadRegisterConfig({ DISCORD_TOKEN: 't', GUILD_ID: '1' }),
    ).toThrow(/CLIENT_ID/);
    expect(
      loadRegisterConfig({ DISCORD_TOKEN: 't', CLIENT_ID: '1', GUILD_ID: '2' }),
    ).toEqual({ token: 't', clientId: '1', guildId: '2' });
  });
});
