# Contributing

By participating in this project, you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Development Setup

```bash
pnpm install
pnpm test
pnpm build
```

Local runs use a throwaway Discord application on a private test server. Never
put the production token in `.env`. See [docs/HOSTING.md](docs/HOSTING.md).

## Changing The Pose List

Poses live in `poses.json` and change by pull request only. The bot validates
the file at startup and refuses to start if it is invalid. `pnpm test` runs the
same validation, so a bad list fails CI before it can ship.

**The admin team owns the list.** Poses come from what admins use in real
verification tickets. A pull request that adds, changes or removes a pose needs
the admin team's agreement, and is judged against these rules:

- **Liveness is the aim for most poses.** A pose should ideally be unlikely to
  exist already in photos of the ID owner, from social media or a camera roll,
  so the selfie shows it was taken just now. Not every pose passes this. A few
  common gestures, like a thumbs up or a peace sign, stay on the list on
  purpose because admins use them regularly.
- **Face match still holds.** The admin matches the selfie against the ID
  photo, a neutral frontal face. Nothing that hides the eyes or distorts the
  face compared with that photo.
- **Props are held beside the face**, so the object is in frame with the face.
  No "in your hand" variants.
- **Every pair of poses must be distinguishable in a photo.** Picture the pair
  as a mirrored, frontal, arm's-length selfie. Finger count counts as a
  difference, so "one finger" and "two fingers" at the same spot are two poses.
- **No "left" or "right."** Front cameras mirror the image, so an admin cannot
  tell which side was meant. A test enforces this.
- **Short, plain sentences.**

Finger poses and props are fine. Not every pose works for every member, and
that is what the last line of every pose message is for: "If this one doesn't
work for you, just let us know and we'll send another." A member who cannot do a
pose says so, which stops the clock, and the admin sends another, with the
`custom` option if needed.

## Commit Messages

[Conventional Commits](https://www.conventionalcommits.org/), enforced by
commitlint on every commit: `<type>(<scope>): <subject>`. Allowed types: feat,
fix, docs, style, refactor, test, chore, build, ci, perf, revert.

## Code Style

Prettier formats and ESLint lints; both run on staged files before each commit,
followed by `pnpm typecheck` and `pnpm test`. No em dashes anywhere, including
comments and commit messages. A test enforces this for files in the repo.

## Pull Requests

1. Branch from `main` as `type/kebab-case-description`.
2. Keep CI green: lint, typecheck, test, build.
3. Fill in the pull request template.
