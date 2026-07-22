# Contributing

Thanks for your interest in DSA Mastery OS.

## Ground rules

- Open an **issue first** for anything beyond a small bugfix or typo (new features, refactors, architecture, UI redesigns, dependency changes).
- One concern per pull request. Keep PRs focused and reviewable.
- Do not rewrite project structure, branding, or core design without prior agreement in an issue.
- All contributions land via pull request. Direct pushes to `main` are blocked.

## Workflow

1. Fork the repo and create a branch from `main`.
2. Make your change. Match existing code style and package boundaries (see `CLAUDE.md`).
3. Run locally before opening a PR:

   ```bash
   pnpm build && pnpm lint && pnpm test
   ```

4. Open a PR against `main` and fill in the template.
5. Wait for CI (`lint-and-test`) to pass. A maintainer will review.

## What we will not merge

- Drive-by redesigns or broad rewrites without an approved issue
- Secrets, credentials, or personal `.env` contents
- Changes that break the single-learner / Notion-canonical model without discussion

## Questions

Use GitHub Issues. For security-sensitive reports, do not open a public issue — contact the maintainer privately.
