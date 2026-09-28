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

A pose exists for two reasons, and every pose must pass both:

- **Liveness.** It proves the selfie was taken just now. It must be unlikely to
  exist already in photos of the ID owner, from social media or a camera roll,
  and impossible to produce by cropping or rotating an existing photo. Common
  expressions, head tilts, waves and framing tricks fail this.
- **Face match.** The admin matches the selfie against the ID photo, a neutral
  frontal face. The pose must leave the face as easy to match as a neutral
  selfie: facing the camera, eyes open and unshaded, features undistorted, and
  the hand never covering the eyes or most of the nose or mouth. Expressions
  fail this by definition.

Every pose must also be:

- doable one-handed, with the other hand holding the phone
- independent of any one specific ability, like full arm range, standing, or
  fine finger control
- free of props
- impossible to read as sexual or flirtatious, including "cute selfie" gestures
- short and plain, with no "left" or "right" (front cameras mirror the image;
  a test enforces this)
- **distinguishable from every other pose in a real selfie.** Picture the pair
  as a mirrored, frontal, arm's-length photo. Location and hand shape can tell
  two poses apart; side never can, and touching versus hovering never can. If
  an admin could not tell them apart, only one stays.

Fewer good poses beat more weak ones.

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
