# Hosting Runbook

How to take the pose bot from this repository to a running bot on the PNWKC
server, from a standing start. Adapted from the theme bot's runbook.

Follow it in order. Every step says what success looks like. **Nothing here
touches the live server until [Part 5](#5-inviting-the-production-bot).** Parts
1 to 4 are preparation on your own private test server, and all of them are
reversible.

## Contents

1. [Before You Start](#1-before-you-start)
2. [Creating The Discord Applications](#2-creating-the-discord-applications)
3. [Minimum Permissions And The Invite Link](#3-minimum-permissions-and-the-invite-link)
4. [Testing On Your Private Server](#4-testing-on-your-private-server)
5. [Inviting The Production Bot](#5-inviting-the-production-bot)
6. [Server Owner Setup](#6-server-owner-setup)
7. [Deploying To Fly](#7-deploying-to-fly)
8. [Registering The Command](#8-registering-the-command)
9. [The One-Machine Rule](#9-the-one-machine-rule)
10. [Changing Poses And Redeploying](#10-changing-poses-and-redeploying)
11. [Appendix: Reading The Logs](#appendix-reading-the-logs)

---

## 1. Before You Start

### What You Need

- Admin on the PNWKC server, and the server owner available for two clicks in
  [Part 6](#6-server-owner-setup).
- A private Discord server of your own for testing, plus a second Discord
  account to play the member.
- A Fly account with a payment card. This bot uses the smallest machine and no
  volume.
- This repository checked out, with `pnpm install` run.

### Vocabulary

- **Discord application**: the registration in Discord's developer portal that
  owns a bot. It holds the bot token and its slash commands. One application,
  one bot identity.
- **Bot token**: the password for the bot. Anyone holding it can act as the bot.
  It never goes in the repository.
- **Guild**: Discord's API name for a server. `GUILD_ID` is a server ID.

### The Rule This Runbook Is Built Around

**There are two applications, and the production token never touches your
laptop's `.env`.** The dev application is for your private server. The
production application is for PNWKC. `.env` only ever holds the dev token.

This is not theoretical. On the theme bot, a production token in a local `.env`
meant a local test process and the deployed bot both answered the same
interactions, and the bug looked like a plausible wrong answer instead of an
error. For this bot the equivalent is a member getting two different poses and
two expiry messages in a real verification ticket.

---

## 2. Creating The Discord Applications

Do this section **twice**: once for a throwaway dev application named something
like `pose-bot-dev`, and once for production. Do the dev one first.

### 2.1 Create The Application

1. Go to <https://discord.com/developers/applications>.
2. Top right, **New Application**.
3. Name it. For production, this is the name members see next to the pose
   message. The name and avatar are an open item on the project; for dev, any
   name works.
4. Accept the terms and **Create**.

Success: you land on the application's General Information page.

### 2.2 Set The Identity

Still on **General Information**, upload an **App Icon** if you have one and
save. It becomes the bot's avatar. Optional for dev.

### 2.3 Configure The Bot User

1. Left sidebar, **Bot**.
2. **Privileged Gateway Intents**: leave **all three off**. Presence, Server
   Members and Message Content are all unused. Message Content in particular
   must stay off: it is what keeps the ID photos out of the bot's hands.
3. **Public Bot**: turn it **off**, so nobody else can add your bot to their
   server.
4. Save.

Success: the Bot page shows the username, a Reset Token button, and all three
privileged intent toggles off.

### 2.4 Get The Token And Application ID

**Never paste either into the repository, a chat, or any tracked file.**

1. **Bot** page, **Reset Token**, confirm, copy. This is `DISCORD_TOKEN`. It is
   shown once. If you lose it, reset again.
2. **OAuth2** page, copy the **Client ID**. This is `CLIENT_ID`. Not secret.

Where each one goes:

| Application | `DISCORD_TOKEN` goes in                                             | `CLIENT_ID` goes in                        |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------ |
| Dev         | local `.env`                                                        | local `.env`                               |
| Production  | a private file such as `~/.config/pose-bot/token`, then Fly secrets | wherever you like; you type it inline once |

For the production token file:

```bash
mkdir -p ~/.config/pose-bot && chmod 700 ~/.config/pose-bot
pbpaste > ~/.config/pose-bot/token && chmod 600 ~/.config/pose-bot/token
```

For dev:

```bash
cp .env.example .env
```

Open `.env` and fill in the dev token, the dev client ID, and your private
server's ID as `GUILD_ID` (Developer Mode on, right-click the server icon,
**Copy Server ID**).

Success: `git status` does not list `.env`.

---

## 3. Minimum Permissions And The Invite Link

### 3.1 The Permissions And Why

The bot needs exactly three channel permissions, in the ticket channels only.

| Permission           | Why                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| View Channels        | To see the ticket channel at all: to post in it and to receive the event when the member posts. Without it the bot gets no message events for that channel, so the clock can never stop.                          |
| Send Messages        | To post the pose message and the expiry message.                                                                                                                                                                  |
| Read Message History | The expiry message is a reply to the pose message. Discord's Create Message reference: "When creating a message as a reply to another message, the current user must have the `READ_MESSAGE_HISTORY` permission." |

Permissions integer: `68608` (View Channels 1024 + Send Messages 2048 + Read
Message History 65536).

Deliberately not needed:

- **Manage Messages.** Striking through a replaced pose edits the bot's own
  message, which any author can do.
- **Mention Everyone.** The expiry message names the Admin role without pinging
  it. The mention still renders as `@Admin`; allowed mentions stop the ping.
- **Embed Links, Attach Files, Add Reactions, Manage Channels, Manage Roles.**
  The bot does none of these.
- **Anything for the slash command itself.** Replying to an interaction needs no
  channel permission.

If your ticket bot opens tickets as **threads** rather than channels, the bot
also needs **Send Messages in Threads**. Check in [Part 4](#4-testing-on-your-private-server)
which kind your ticket bot makes.

### 3.2 Build The Invite Link

1. Left sidebar, **OAuth2**, then **URL Generator**.
2. **Scopes**: tick **`bot`** and **`applications.commands`**.
3. **Bot Permissions**: tick exactly **View Channels**, **Send Messages** and
   **Read Message History**.
4. Copy the generated URL.

Or build them by hand, substituting each application's client ID. **The two
links differ on purpose.**

Dev, for your private server. The permissions go on the bot's role
server-wide, which is fine on a server only you use:

```
https://discord.com/oauth2/authorize?client_id=DEV_CLIENT_ID&scope=bot+applications.commands&permissions=68608
```

Production, for PNWKC. **No permissions at all**:

```
https://discord.com/oauth2/authorize?client_id=PROD_CLIENT_ID&scope=bot+applications.commands&permissions=0
```

Why zero for production: a server-wide View Channels would let the bot receive
a message event from every public channel on PNWKC, and the one case where
Discord sends content without the Message Content intent (a message that
@mentions the bot) would widen from ticket channels to the whole server. With
`permissions=0`, the only place the bot can see anything is the ticket category,
through the overwrite the server owner adds in [Part 6](#6-server-owner-setup).
That overwrite also means `/pose` run anywhere else fails in-band with "I can't
see this channel", which is a second channel limit on top of the one in 6.2.

---

## 4. Testing On Your Private Server

Everything in this part uses the **dev** application and your private server.

1. Invite the dev application with its link from 3.2.
2. Create a text channel to stand in for a ticket, and give your second account
   access to it.
3. Register and run:

   ```bash
   pnpm build
   pnpm register    # uses .env: dev CLIENT_ID and your private GUILD_ID
   pnpm start
   ```

   Success: `Registered. /pose should appear in that server right away.`, then
   `event=ready user=<id>` and `Loaded 25 poses. Timeout 5 minutes.`

4. Set `POSE_TIMEOUT_MINUTES=1` in `.env` while testing, so expiry does not take
   five minutes each time. Restart after changing it.
5. Work through the manual checklist in the build report: issue a pose, let it
   expire, respond in time, reply from a second account, replace a live pose,
   delete the channel mid-timer.

Stop the local process (Ctrl+C) before moving on. **Never leave it running
while the production bot is live.**

---

## 5. Inviting The Production Bot

This is the first step that touches PNWKC.

1. Open the **production** invite link from 3.2 in a browser logged into your
   admin account.
2. Pick the PNWKC server and **Authorize**.

Success: the bot appears in the member list, offline. It stays offline until
[Part 7](#7-deploying-to-fly).

---

## 6. Server Owner Setup

Two steps, both for the server owner.

### 6.1 Give The Bot's Role Access To Ticket Channels

1. On the **ticket category**, add a permission overwrite for the bot's role
   with **View Channels**, **Send Messages** and **Read Message History**
   allowed.
2. **Open a test ticket and confirm the role carries into the new channel.**
   Channel settings, Permissions: the bot's role should be listed with those
   three. If it is not, the ticket bot builds ticket channels with its own
   overwrites rather than syncing to the category, and the ticket bot's own
   settings need to add the pose bot's role.

### 6.2 Open /pose To Admins, In Ticket Channels Only

`/pose` is registered with a default of Administrator, so until this step only
server administrators can see it.

1. **Server Settings**, **Integrations**, then the pose bot.
2. Under the `/pose` command, **Roles & Members**: add the Admin role.
3. Under **Channels**: remove **All Channels** and add the ticket category.

**Unverified: whether this picker accepts a category, and whether ticket
channels created later inherit it.** Check by opening a new test ticket after
this step and confirming `/pose` shows in it and not in an ordinary channel.

If the picker only takes individual channels, it cannot cover tickets that do
not exist yet. In that case leave **Channels** at **All Channels** and rely on
the Admin role limit. The bot still cannot post outside the ticket category,
because with the `permissions=0` invite it has no access anywhere else, so a
stray `/pose` outside a ticket fails in the admin's own reply and posts
nothing.

Success: an Admin who is not a server administrator can see `/pose` in a ticket
channel, and either cannot see it elsewhere or gets the "can't see this
channel" reply there.

---

## 7. Deploying To Fly

### 7.1 Install And Sign In

```bash
brew install flyctl
fly auth login
```

Success: `fly auth whoami` prints your email.

### 7.2 Create The App

From the repository root. Back up `fly.toml` first, because `fly launch`
rewrites it:

```bash
cp fly.toml fly.toml.bak
fly launch --no-deploy
```

- **App name**: pick a globally unique name and write it down.
- **Region**: `sjc` or whatever is closest. There is no volume, so the region
  only affects latency.
- **Databases**: no to all.
- **Deploy now**: no.

Then diff:

```bash
diff fly.toml.bak fly.toml
```

**Delete any `[http_service]` block it added.** This bot is a worker that
listens on no port. With a service defined, Fly stops the machine when no HTTP
requests arrive, and none ever will, so `/pose` silently stops answering.

**Keep the `[env]` block**, including `POSE_TIMEOUT_MINUTES = '5'`. It is not a
secret, so it lives in `fly.toml` rather than in Fly's secret store.

There is **no `[[mounts]]` block and no volume**. Nothing persists. If
`fly launch` offers to create a volume, decline.

Commit the updated `fly.toml` with the real app name.

### 7.3 Set The Secrets

```bash
fly secrets set DISCORD_TOKEN="$(cat ~/.config/pose-bot/token)"
fly secrets set ADMIN_ROLE_ID=<the PNWKC Admin role ID>
```

`ADMIN_ROLE_ID` is optional and not really secret; keeping it in secrets keeps
the server's role ID out of the repository. Without it the expiry message says
"Tag an admin" in plain text. Find the ID with Developer Mode on: Server
Settings, Roles, right-click Admin, **Copy Role ID**.

`CLIENT_ID` and `GUILD_ID` are not needed on Fly. The running bot does not use
them; only registration does.

Success: `fly secrets list` shows the names with digests, never the values.

### 7.4 Deploy

```bash
fly deploy
```

**`fly deploy` reporting success is not proof.** Fly counts a started machine as
a success even if the process exits a second later. Check the log:

```bash
fly logs --no-tail
```

Expected:

```
event=ready user=<bot user id>
Loaded 25 poses. Timeout 5 minutes.
```

A `Refusing to start:` line names exactly what is wrong: a missing
`DISCORD_TOKEN`, an invalid `POSE_TIMEOUT_MINUTES` or `ADMIN_ROLE_ID`, or a bad
`poses.json` entry by position.

Then:

```bash
fly status
```

It should show **one** machine, **started**. `stopped` means an
`[http_service]` block survived; go back to 7.2.

---

## 8. Registering The Command

Registration is a plain HTTP call from your laptop. The bot does not need to be
running.

### 8.1 Against Production

Use the production token from its file and pass the IDs inline, so `.env` keeps
its dev values:

```bash
pnpm build
DISCORD_TOKEN="$(cat ~/.config/pose-bot/token)" CLIENT_ID=<production client id> GUILD_ID=<PNWKC server id> pnpm register
```

`dotenv` does not overwrite a variable that is already set, so the inline
values win and anything you leave out still comes from `.env`. **Leave nothing
out.** Omit `GUILD_ID` and the production command lands on your private server;
omit `CLIENT_ID` and it tries the dev application with the production token and
fails.

Success: `Registered. /pose should appear in that server right away.`

### 8.2 What It Does

- It is **guild-scoped**. `/pose` exists only in the one server you register it
  to, and changes appear immediately rather than after global propagation.
- It is a **full replace** for that application in that guild. Anything not in
  the array is deleted from that guild. There is only one command, so this only
  matters if someone adds a second.
- **Dev and production use different `GUILD_ID`s**: your private server for dev,
  PNWKC for production. Registering the dev application to PNWKC would put a
  second `/pose` in front of the admins, answered by whatever machine runs the
  dev token.
- Re-run it only when the command definition changes (`src/command.ts`). New
  poses and new handler code do not need it.

---

## 9. The One-Machine Rule

**Never run more than one instance with the production token.** That means one
Fly machine, and no local process with the production token while the Fly
machine is up.

Two instances would both answer every `/pose`: the member gets two different
poses, and five minutes later two expiry messages. Each instance keeps its own
timers, so the member cannot tell which pose is the real one.

Check with `fly status`. Correct with:

```bash
fly scale count 1
```

---

## 10. Changing Poses And Redeploying

1. Edit `poses.json` on a branch. `pnpm test` runs the same validation the bot
   runs at startup: non-empty, no blanks, no duplicates, each at most 200
   characters.
2. Merge, then `fly deploy`.

**A deploy restarts the bot and drops every live timer.** Poses issued before
the deploy never get an expiry message. Their deadline still shows in the
channel, so an admin can see a pose ran out, but it is kinder to deploy when no
verification is in progress.

To roll back, find the previous release and redeploy its image:

```bash
fly releases --image
fly deploy --image <previous image ref>
```

---

## Appendix: Reading The Logs

```bash
fly logs            # live
fly logs --no-tail  # recent, then exit
```

Every line is an event type with a channel ID and user ID, and at most a
Discord error code. Nothing else is logged, by design.

| Line                                                  | Meaning                                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `event=pose_issued channel=C user=U`                  | A pose was posted for member U in channel C, and the timer is running.                                   |
| `event=pose_answered channel=C user=U`                | U posted in C before the deadline. Clock stopped.                                                        |
| `event=pose_expired channel=C user=U`                 | The deadline passed. The expiry message is being sent.                                                   |
| `event=pose_replaced channel=C user=U`                | A newer `/pose` in C replaced U's live pose.                                                             |
| `event=pose_cleared_channel_deleted channel=C user=U` | The ticket was deleted mid-timer.                                                                        |
| `event=pose_send_failed channel=C user=U code=50013`  | The pose could not be posted. `50013` is a missing permission, `50001` is no access. The admin was told. |
| `event=expiry_send_failed ...`                        | The expiry message could not be sent. Usually the channel is gone.                                       |
| `event=mark_replaced_failed ...`                      | The old pose could not be struck through. The new pose still went out and only it can expire.            |
| `event=handler_error ...`                             | A handler threw. For `/pose`, the admin saw the error in their reply.                                    |
| `event=unhandled_rejection`                           | Something failed outside any handler. The bot kept running.                                              |
