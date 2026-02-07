# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Expo React Native client (Expo Router) with assets, components, and constants; entry via `app/app/index.tsx`.
- `web/`: Next.js marketing/site code under `src/`, with components in `src/components` and styles in `src/app/globals.css`.
- `api/`: Express + TypeScript fee-payer API; source in `src/`, built output in `dist/`.
- `programs/key-registry/`: Anchor/Solana program code (Rust) with instructions in `src/lib.rs`; configured by `Anchor.toml`.
- Root `Cargo.toml` defines the workspace for on-chain programs; `target/` is build output (avoid committing).

## Build, Test, and Development Commands
- App: from `app/`, install with `npm install`; run `npm start` (Expo bundler), `npm run ios`/`android` for simulators, `npm run web` for browser preview.
- Web: from `web/`, `npm install` then `npm run dev` (Next dev server), `npm run build` for production, `npm run start` to serve the build, `npm run lint` to check TS/JS.
- API: from `api/`, `npm install`, `npm run dev` for watch mode, `npm run build` to emit `dist/`, `npm start` to run compiled server, `npm test` (Vitest).
- Programs: from repo root, `anchor build` to compile on-chain code, `anchor test` to run Anchor/ts-mocha tests (uses `Anchor.toml` provider settings).

## Coding Style & Naming Conventions
- TypeScript/TSX everywhere; prefer 2-space indentation, semicolons optional but stay consistent with touched files.
- React components: PascalCase filenames and exports; hooks/utilities in camelCase; keep modules co-located with feature folders.
- Linting via Next’s ESLint config in `web/`; run lint before PRs. For Rust programs, run `cargo fmt && cargo clippy` before pushing.
- Environment values come from `.env`/`.env.local` (never commit secrets).

## Testing Guidelines
- API: Vitest for unit/integration; add tests alongside code under `api/src/**/__tests__` or `*.test.ts`; ensure deterministic data and mocked RPC calls.
- Programs: prefer `anchor test` with deterministic keypairs; document test accounts and airdrops used.
- Frontends: add lightweight component tests when feasible (e.g., React Testing Library) and manual smoke (navigation, critical flows) before merges.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subjects (e.g., `Add wallet validation`, `Fix fee payer rate limit`). Squash noisy WIP commits before merging.
- PRs: include what/why, linked issues, and testing notes/outputs (`npm test`, `anchor test`, manual checks). Add screenshots for UI-facing changes.
- Keep diffs minimal and isolated per domain (`app`, `web`, `api`, `programs`). Update relevant configs/docs when adding env vars or migrations.

## Security & Configuration Tips
- Keys and RPC endpoints belong in env files; prefer placeholders in commits. Rotate any leaked keys immediately.
- When running against Solana devnet/localnet, confirm `Anchor.toml` provider cluster and wallet paths; avoid using production wallets for tests.
