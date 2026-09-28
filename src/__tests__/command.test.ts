import { ApplicationCommandOptionType, PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { poseCommandJson } from '../command';
import { MAX_POSE_LENGTH } from '../poses';

describe('/pose definition', () => {
  const json = poseCommandJson();

  it('is named pose', () => {
    expect(json.name).toBe('pose');
  });

  it('defaults to Administrator so it fails closed', () => {
    expect(json.default_member_permissions).toBe(
      PermissionFlagsBits.Administrator.toString(),
    );
    expect(json.default_member_permissions).toBe('8');
  });

  it('takes a required user and an optional, length-capped custom text', () => {
    expect(json.options).toHaveLength(2);
    const [user, custom] = json.options as unknown as Array<
      Record<string, unknown>
    >;
    expect(user).toMatchObject({
      name: 'user',
      type: ApplicationCommandOptionType.User,
      required: true,
    });
    expect(custom).toMatchObject({
      name: 'custom',
      type: ApplicationCommandOptionType.String,
      max_length: MAX_POSE_LENGTH,
    });
    expect(custom.required).toBeFalsy();
  });
});
