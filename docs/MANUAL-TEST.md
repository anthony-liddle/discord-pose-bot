# Manual Test Checklist

The checks that need a real Discord connection. Everything else is covered by
`pnpm test`. This is the single list; it replaces the checklists in the build
reports.

## Setup

- Use the **dev** application on your private test server only
  ([HOSTING Part 4](HOSTING.md#4-testing-on-your-private-server)). Never the
  production token.
- Set `POSE_TIMEOUT_MINUTES=1` in `.env` so expiry takes a minute, and restart
  after changing it.
- Have a second Discord account as the member. A third account helps for
  item 4.
- Keep the bot's terminal visible. Log lines look like
  `event=pose_issued channel=C user=U`.

The message cache is always off, so every item below also checks that posting,
striking through and replying work without it. Items 3, 4, 5, 8 and 10 passing
on a real connection is the live confirmation of the gateway path the tests
simulate.

## The Messages, As They Should Read

Pose message, random or custom:

> @member Here's your pose for the selfie: **{pose}**
> Post it in this channel within {n} minutes, by {time}, and tag @Admin.
> If this one doesn't work for you, just let us know and we'll send another.

Replaced pose, after a newer `/pose`:

> @member Here's your pose for the selfie: ~~**{pose}**~~
> This pose was replaced. Use the one below.

Expiry, as a reply to the pose message:

> @member That pose has expired. Tag @Admin whenever you're ready and we'll send
> you a new one 💛

With `ADMIN_ROLE_ID` unset, both messages say "an admin" in plain text where
they show @Admin: "and tag an admin" in the pose message, "Tag an admin" in the
expiry.

## Core Flow

1. **Issue a pose.** Run `/pose user:<member>`.
   - Your ephemeral confirmation reads "Posted a pose for @member: **{pose}**",
     with no deadline of its own.
   - The pose message pings only the member and reads as above.
   - The deadline line names the window from `POSE_TIMEOUT_MINUTES` ("within
     1 minute" with the setup above) and a fixed local time, and ends "and tag
     @Admin."
   - **The accessibility line is the last line**, after the deadline line.
   - Log: `event=pose_issued`.
   - **@Admin shows but does not notify.** With `ADMIN_ROLE_ID` set to a role
     your admin account holds, the pose message shows the @Admin pill, and
     that account gets no mention or notification from it.
   - **The member's own tag does notify.** First confirm the role allows the
     member to mention it: in Server Settings, Roles, open the role and check
     "Allow anyone to @mention this role" on the Display tab. Without it the
     member's tag fails for a reason that has nothing to do with the bot. Then
     the member posts a message that tags @Admin. Your admin account gets the
     mention. This also answers the pose, so `event=pose_answered` follows and
     no expiry arrives.
2. **Let it expire.** Issue a pose and wait out the timer without responding.
   - The expiry arrives on time, as a reply to the pose message.
   - It pings the member. `@Admin` renders but does not ping; check from an
     account that holds the role.
   - The pose message is unchanged after expiry: no edit, and the deadline
     line reads exactly as it did.
   - Your confirmation, if still open, also reads exactly as it did.
   - This also shows the bot's own pose message does not stop the clock.
   - Log: `event=pose_expired`.
3. **Respond in time.** Issue a pose. The member posts anything, text or image,
   before the deadline.
   - Nothing visible happens, and no expiry follows when the deadline passes.
   - Log: `event=pose_answered`.
4. **Other people and other channels do not count.**
   - Issue a pose. A different account posts in the channel. The expiry still
     fires.
   - Issue a pose. The member posts in a different channel. The expiry still
     fires.

## Replacement

5. **Replace a live pose.** Issue a pose, then run `/pose` again before the
   deadline.
   - The first message is edited to the struck-through pose and "This pose was
     replaced. Use the one below.", with no accessibility line, and pings no
     one.
   - The second message is a different pose. Your confirmation adds "This
     replaced the pose that was still live in this channel."
   - **Exactly one** expiry arrives, for the second pose, at its deadline.
   - Logs: `event=pose_replaced`, then `event=pose_expired`.
6. **Two admins at once (best effort).** Two admin accounts run `/pose` in the
   same channel within a second of each other. Usually both arrive in order and
   this looks like item 5. If the older message comes back second, it is the
   one struck through, the newer stays live, and that admin's reply says a
   newer pose was already posted. Log: `event=pose_superseded`. Hard to trigger
   by hand; the tests cover both orders.

## Custom Poses And Refusals

7. **Custom pose and refusals.**
   - `/pose user:<member> custom:Wave with **both** hands`: the custom text
     shows, the asterisks show literally, and the accessibility line is still
     last.
   - `/pose user:<a bot>`: an ephemeral refusal, and nothing is posted.

## Failure Paths

8. **Deleted pose message.** Issue a pose, delete the pose message itself, and
   let it expire.
   - The expiry still arrives, as a plain message rather than a reply.
   - No `event=expiry_send_failed` in the log.
9. **Delete the channel mid-timer.** Issue a pose and delete the channel before
   the deadline.
   - No error at the deadline.
   - Log: `event=pose_cleared_channel_deleted`.
10. **Missing Send Messages is reported in-band.** Remove Send Messages from the
    bot in the channel, then run `/pose`.
    - Your ephemeral reply says a permission is missing and no timer was
      started.
    - Log: `event=pose_send_failed code=50013`. Restore the permission.
11. **Read Message History is needed.** Remove Read Message History from the
    bot in the channel, issue a pose and let it expire.
    - The pose posts, but the expiry fails with
      `event=expiry_send_failed code=50013`.
    - Restore the permission. This proves the permission is required.

## Privacy

12. **A tagged ID message leaves nothing behind.** The member posts an image
    and @mentions the bot in the same message. This is the one case where
    Discord sends the bot content. Only `event=pose_answered` appears in the
    logs, with no text, filename or link.

## Operations

13. **Restart visibility.** Issue a pose, stop the bot with Ctrl+C before the
    deadline, and restart it.
    - No expiry arrives.
    - The pose message is unchanged. Its deadline is now in the past with no
      expiry under it, which is the only sign the timer was lost.
14. **A reset token makes the process exit.** Start the bot with
    `node dist/src/index.js` rather than `pnpm start`, so `echo $?` reports the
    bot's own exit code and not pnpm's. Then open the dev application in the
    Developer Portal, **Bot**, and **Reset Token**.
    - Within a short time the process exits with status 1, after
      `event=shard_disconnect code=4004`. Check with `echo $?` after it stops.
    - It does not stay up silently. On Fly this shows as a restart loop in
      `fly status`.
    - Put the new token in `.env` before starting it again.
    - If nothing happens for several minutes, note it: Discord may only close
      the session on the next reconnect.
15. **Shutdown still exits 0.** Start the bot with `node dist/src/index.js` and
    stop it with Ctrl+C.
    - Log: `event=shutdown`, and `echo $?` prints 0.
    - There is no `event=shard_disconnect`.

## Server Setup

16. **Channel limit.** In Integrations, limit `/pose` to a category. Create a
    channel inside that category and an ordinary channel outside it.
    - As a non-administrator with the Admin role, `/pose` shows in the first
      channel and not the second.
    - If the picker will not take a category, follow the fallback in
      [HOSTING 6.2](HOSTING.md#62-open-pose-to-admins-in-ticket-channels-only).

## After Deploying To Fly

17. **The bot runs as the `node` user.** `fly ssh console -C id` is not the
    check: `fly ssh` logs in as root by default and reports its own session.
    Read the bot process's user instead:

    ```bash
    fly ssh console -C "sh -c 'for p in /proc/[0-9]*; do [ \"\$(cat \$p/comm 2>/dev/null)\" = node ] && grep ^Uid: \$p/status; done'"
    ```

    - One line, `Uid:	1000	1000	1000	1000`. A `0` means it runs as root.
    - `fly status` shows exactly one machine, started.

18. **The machine stays up with nothing to do.** Deploy, then issue nothing
    for ten minutes.
    - `fly status` still shows the machine started. A machine that has stopped
      by itself means a service block is back in `fly.toml`; `pnpm test`
      catches that.
    - Then issue a pose and let it expire. The expiry arrives on time.

## Before Relying On It At PNWKC

- Open a real test ticket and confirm the bot's role carries into it.
- Find out whether closing a ticket deletes the channel or archives it.
