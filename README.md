# Strike A Pose

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue)
![discord.js](https://img.shields.io/badge/discord.js-14-5865F2)

A Discord bot that hands out a random selfie pose in age verification tickets
and says when the pose has expired.

An admin runs `/pose` for a member. The bot posts a random pose for the
member's verification selfie. If the member does not post anything in that
channel within five minutes, the bot replies that the pose expired. The admin
still does the actual ID match. The bot only hands out poses and runs the clock.

## Features

- `/pose user:<member> custom:<optional text>`, one command, guild only, locked
  to Administrator until the server owner opens it up.
- A random pose from `poses.json`, never the same as the last one issued in that
  channel. `custom` lets an admin give an alternative on the spot.
- A deadline shown as a local time and a live relative time.
- Any message from the member in that channel, posted after the pose, stops
  the clock. That includes a reply to the pose message's last line, "If this
  one doesn't work for you, just let us know and we'll send another." A member
  asking for a different pose stops the clock on purpose: the admin then sends
  another one, with `custom` if needed.
- Running `/pose` again in the same channel replaces the live pose, strikes the
  old one through, and restarts the clock. Only one expiry can ever fire per
  channel.
- Pings only the member, on every message it sends.

## Privacy

The bot runs with the `Guilds` and `GuildMessages` gateway intents only. It
does **not** request Message Content or Guild Members. Without Message Content,
Discord delivers messages in ticket channels with the text and attachments
empty, so the bot never receives the ID photos. It sees that the member posted,
and that is all it needs. A test pins the intent list.

One exception is Discord's, not the bot's: a message that @mentions the bot
arrives with its content and attachments even without the intent. Discord still
sends it, and nothing in this bot can stop that. What the bot controls is what
it keeps:

- **The discord.js message cache is off.** By default discord.js keeps the last
  200 messages per channel, which would hold a tagged ID message, its photo
  link included, until evicted. The client is built with a message cache of
  zero, which covers every place discord.js stores a received message.
- **The `messageCreate` handler copies out three IDs** (channel, author,
  message) and keeps no reference to the message.
- **Nothing reads message content, and nothing logs it.** Logs hold an event
  type, a channel ID and a user ID, nothing else.

So no cache and no code keeps a reference to a received message past the event.
The object still sits in memory until garbage collection reclaims it, as any
short-lived value does. Tests pin the intents, the zero message cache, and the
three-ID handoff, on the same client production builds.

## Timers Live In Memory

Timers are not persisted. **A restart or deploy drops every live timer**, and
no expiry message is sent for those poses. The pose message shows its deadline
as a time and a relative time ("by 3:45 PM (10 minutes ago)"), so a lost timer
is visible in the channel rather than silent. If that happens, the admin runs
`/pose` again, which is the manual process the bot replaced.

## Getting Started

```bash
pnpm install
cp .env.example .env    # throwaway dev application only, never production
pnpm test
pnpm build
pnpm register           # registers /pose to GUILD_ID
pnpm start
```

Full setup, including creating the Discord applications, the minimum invite
permissions, and deploying to Fly, is in [docs/HOSTING.md](docs/HOSTING.md).

### Configuration

| Variable               | Required     | Meaning                                                                             |
| ---------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`        | yes          | Bot token.                                                                          |
| `CLIENT_ID`            | for register | Application ID.                                                                     |
| `GUILD_ID`             | for register | The server `/pose` is registered to.                                                |
| `ADMIN_ROLE_ID`        | no           | Role named, without a ping, in the expiry message. Unset: "Tag an admin".           |
| `POSE_TIMEOUT_MINUTES` | no           | Whole number from 1 to 60. Default 5. The bot refuses to start on an invalid value. |

## Project Structure

```
poses.json              the pose list, validated at startup
register-commands.ts    registers /pose to one guild
src/
  sessions.ts           live poses and timers; no discord.js import
  poses.ts              validation and the no-repeat picker
  copy.ts               every user-facing string
  pose-command.ts       the /pose handler
  discord-actions.ts    expiry reply and replaced-pose edit
  bot.ts                event wiring and the error boundary
  client.ts             the client and its intents
  config.ts             environment validation
  index.ts              startup
docs/HOSTING.md         runbook: applications, permissions, Fly, registration
```

## Tech Stack

TypeScript, discord.js 14, Vitest, ESLint, Prettier, Husky, commitlint. Hosted
on Fly as a single worker machine.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Poses change by pull request.

## License

[MIT](LICENSE)
