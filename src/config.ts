type Env = Record<string, string | undefined>;

export interface BotConfig {
  token: string;
  /** The Admin role named, without a ping, in the pose and expiry messages. */
  adminRoleId: string | undefined;
  timeoutMinutes: number;
}

export interface RegisterConfig {
  token: string;
  clientId: string;
  guildId: string;
}

export const DEFAULT_TIMEOUT_MINUTES = 5;
export const MAX_TIMEOUT_MINUTES = 60;

const SNOWFLAKE = /^\d{15,21}$/;

function optional(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function required(env: Env, name: string): string {
  const value = optional(env, name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function loadBotConfig(env: Env): BotConfig {
  const token = required(env, 'DISCORD_TOKEN');

  const adminRoleId = optional(env, 'ADMIN_ROLE_ID');
  if (adminRoleId !== undefined && !SNOWFLAKE.test(adminRoleId)) {
    throw new Error(
      `ADMIN_ROLE_ID must be a role ID (a long number), got "${adminRoleId}"`,
    );
  }

  const rawTimeout = optional(env, 'POSE_TIMEOUT_MINUTES');
  let timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
  if (rawTimeout !== undefined) {
    timeoutMinutes = Number(rawTimeout);
    if (
      !/^\d+$/.test(rawTimeout) ||
      timeoutMinutes < 1 ||
      timeoutMinutes > MAX_TIMEOUT_MINUTES
    ) {
      throw new Error(
        `POSE_TIMEOUT_MINUTES must be a whole number from 1 to ${MAX_TIMEOUT_MINUTES}, got "${rawTimeout}"`,
      );
    }
  }

  return { token, adminRoleId, timeoutMinutes };
}

export function loadRegisterConfig(env: Env): RegisterConfig {
  return {
    token: required(env, 'DISCORD_TOKEN'),
    clientId: required(env, 'CLIENT_ID'),
    guildId: required(env, 'GUILD_ID'),
  };
}
