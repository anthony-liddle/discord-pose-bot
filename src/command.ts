import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import { MAX_POSE_LENGTH } from './poses';

export const POSE_COMMAND = 'pose';

/**
 * The /pose definition, shared by register-commands.ts and the tests so the
 * tested shape is the registered shape.
 *
 * Guild-only comes from registering it to one guild: `contexts` applies to
 * global commands only. Administrator is the fail-closed default; the server
 * owner opens it to the Admin role under Server Settings, Integrations.
 */
export function poseCommandJson(): RESTPostAPIChatInputApplicationCommandsJSONBody {
  return new SlashCommandBuilder()
    .setName(POSE_COMMAND)
    .setDescription('Give a member a random pose for their verification selfie')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member being verified')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('custom')
        .setDescription('Use this pose instead of a random one')
        .setMaxLength(MAX_POSE_LENGTH),
    )
    .toJSON();
}
