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
same validation, so a bad list fails CI before it can ship. Every pose must be:

- doable one-handed, with the other hand holding the phone
- independent of any one specific ability, like full arm range, standing, or
  fine finger control
- easy for an admin to check as yes or no against a photo
- free of props
- impossible to read as sexual or flirtatious
- short and plain, with no "left" or "right" (front cameras mirror the image)

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
