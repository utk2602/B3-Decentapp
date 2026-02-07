# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KeyApp is a privacy-first messaging app built on Solana with end-to-end encryption. The app abstracts blockchain complexity from users—they don't see wallets, SOL, or gas fees. Users generate a local Ed25519 keypair, register a username on-chain, and exchange encrypted messages.

## Monorepo Structure

- **`/app`** - Expo React Native client (iOS, Android, Web) using Expo Router
- **`/web`** - Next.js marketing site
- **`/api`** - Express.js + TypeScript fee-payer backend
- **`/programs/key-registry`** - Anchor/Solana on-chain program (Rust)

## Build & Development Commands

### App (Expo)
```bash
cd app
npm install
npm start              # Expo bundler
npm run ios            # iOS simulator
npm run android        # Android emulator
npm run web            # Browser
```

### Web (Next.js)
```bash
cd web
npm install
npm run dev            # Development server
npm run build          # Production build
npm run lint           # ESLint check
```

### API (Express)
```bash
cd api
npm install
npm run dev            # Watch mode with tsx
npm run build          # Compile TypeScript → dist/
npm start              # Run compiled server
npm test               # Run tests with Vitest
```

### On-Chain Programs
```bash
anchor build           # Compile Rust program
anchor test            # Run ts-mocha tests
cargo fmt && cargo clippy  # Format & lint Rust
```

## Architecture

### Authentication & Key Management
- Users generate Ed25519 keypair locally (Solana-compatible)
- Keypair stored in Expo SecureStore (encrypted local storage)
- Username registered on-chain via Anchor program
- Public key base58 used for identification

### Encryption Model
- **Signing**: Ed25519 for transaction signing
- **Messaging**: X25519 Diffie-Hellman key exchange derived from signing keys
  - X25519 keypair derived via `nacl.box.keyPair.fromSecretKey(signingKey.slice(0, 32))`
  - Storage encryption uses same derivation for secretbox
- **Message format**: Base64 encoded (nonce + encrypted payload)
  - Nonce: 24 bytes (nacl.box.nonceLength)
  - Combined format: `nonce + nacl.box(message, nonce, recipientPubKey, senderSecretKey)`
  - Encoded to base64 for transmission
- **Replay Protection**: 5-minute timestamp window (api/src/middleware/auth.ts:22-26)
- Uses TweetNaCl library for all cryptographic operations

### Transaction Flow (Gasless)
1. Client builds unsigned Solana transaction
2. Client signs with own keypair
3. Client sends to API with signature
4. API verifies signature (replay protection: 5-min window)
5. API adds fee payer signature
6. API submits to Solana via RPC

### Real-Time Messaging
- WebSocket listener in `app/lib/websocket.ts` for incoming messages
- Push notifications via Expo Notifications
- Message deduplication and unread count tracking

### Storage & State Management
- **Encrypted Local Storage**: Chat/message data encrypted at rest using TweetNaCl secretbox (app/lib/storage.ts:41-75)
  - Encryption key: First 32 bytes of Ed25519 signing secret key
  - Format: `enc:{base64(nonce + encrypted_payload)}`
  - Backwards compatible with unencrypted legacy data
- **State Management**: No formal library (Zustand/Redux/Context)
  - Component-level `useState` hooks
  - Event callbacks for real-time updates
  - Auth state managed in root layout (app/_layout.tsx)
- **Keychain Storage**:
  - iOS/Android: react-native-keychain with iCloud sync
  - Web: localStorage (with security warnings)
  - Stores: Ed25519 keypair + username
- **Message Deduplication**: Last 1000 transaction signatures cached in AsyncStorage (app/lib/storage.ts:262-285)

## Key Files

- `app/lib/crypto.ts` - Ed25519 & X25519 encryption/signing
- `app/lib/keychain.ts` - Secure key storage abstraction
- `app/lib/api.ts` - API client with signature generation
- `api/src/middleware/auth.ts` - Signature verification
- `api/src/routes/message.ts` - Message sending endpoint
- `programs/key-registry/src/lib.rs` - Username registry program

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check + fee payer balance |
| GET | `/api/config` | App config & version |
| POST | `/api/username/register` | Register new username |
| POST | `/api/message/send` | Send encrypted message |
| POST | `/api/relay` | Relay signed transaction |
| POST | `/api/block` | Block/unblock user |

## Environment Variables

### App
```
EXPO_PUBLIC_API_URL=http://localhost:3000
```

### API
```
SOLANA_RPC_URL=https://api.devnet.solana.com
FEE_PAYER_PRIVATE_KEY=<base58-encoded-key>
NETWORK=devnet|mainnet-beta
UPSTASH_REDIS_REST_URL=<url>
UPSTASH_REDIS_REST_TOKEN=<token>
```

## Coding Conventions

- TypeScript/TSX throughout; 2-space indentation
- React components: PascalCase filenames; hooks/utilities in camelCase
- Co-locate components with feature folders
- Run `cargo fmt && cargo clippy` before pushing Rust changes
- Keep diffs isolated per domain (app/web/api/programs)

## Testing

### Current Infrastructure
- **API**: Vitest configured with 1 test file (api/src/tests/auth.test.ts)
  - Tests signature verification
  - Command: `npm test` (in api/ directory)
- **Programs**: ts-mocha configured in Anchor.toml but no test files present
  - Command: `anchor test` (when tests are added)
- **App**: No test framework configured (Jest/Vitest not set up)
- **Web**: No test framework configured

### Testing Conventions
- Mock RPC calls for determinism in API tests
- Use deterministic keypairs for Anchor program tests
- Frontend testing: React Testing Library recommended (not yet configured)

## Deployment & Infrastructure

### Production Environments
- **API**: Railway (railway.json config)
  - URL: https://keyapp-production.up.railway.app
  - Build: `npm run build && npm start`
  - Restart policy: ON_FAILURE (max 10 retries)
- **App**: Expo Application Services (EAS)
  - Project ID: `b932b963-e6e6-4893-91b2-6426fe58d338`
  - Build profiles: development, preview, production (eas.json)
  - All profiles use production API URL
- **Web**: Vercel (vercel.json config)
  - SPA routing fallback to /index.html
- **On-Chain**: Solana devnet (for development)
  - Program address: `96hG67JxhNEptr1LkdtDcrqvtWiHH3x4GibDBcdh4MYQ`

### CI/CD
- No GitHub Actions workflows configured
- Deployments via platform-specific mechanisms (Railway, EAS, Vercel)

## Development Notes

- **Monorepo Structure**: No root package.json - each workspace (app, web, api) is independent
- **Linting**: Only Web package has ESLint configured (eslint.config.mjs)
  - Web: `npm run lint` (Next.js + TypeScript rules)
  - App/API: No linting configured
  - Rust: Use `cargo fmt && cargo clippy` before commits
- **Pre-commit Hooks**: Not configured (no husky/lint-staged)
- **Platform-Specific Patterns**:
  - Keychain falls back to localStorage on web
  - Haptics conditionally applied (`Platform.OS !== 'web'`)
  - WebSocket for real-time Solana account monitoring
  - Recent refactor: IndexedDB removed in favor of localStorage
