# Key - Privacy-First Messaging

> **"Telegram on Solana. Invisible Crypto. Total Privacy."**

A privacy-first ephemeral messaging app with end-to-end encryption and completely abstracted blockchain. Users never see wallets, SOL, or gas fees.

## Features

- 🔐 **End-to-End Encryption** - X25519 Diffie-Hellman key exchange
- 🔑 **Local Sovereignty** - Private keys never leave your device
- ⛽ **Gasless UX** - Fee payer handles all transaction costs
- 📱 **Cross-Platform** - iOS, Android, and Web via Expo

## Screenshots

*Coming soon*

## Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Access to a Key API server

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/key-app.git
   cd key-app/app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set your API URL:
   ```
   EXPO_PUBLIC_API_URL=https://api.yourserver.com
   ```

4. **Start development server**
   ```bash
   npx expo start
   ```

5. **Run on device**
   - Scan QR code with Expo Go (iOS/Android)
   - Press `w` for web
   - Press `i` for iOS simulator
   - Press `a` for Android emulator

## Project Structure

```
app/
├── app/                 # Expo Router screens
│   ├── (tabs)/          # Tab navigation
│   ├── chat/            # Chat screens
│   └── onboarding.tsx   # Onboarding flow
├── components/          # Reusable UI components
├── constants/           # Colors, config
├── lib/                 # Core utilities
│   ├── api.ts           # API client
│   ├── crypto.ts        # Encryption/signing
│   ├── keychain.ts      # Secure key storage
│   └── storage.ts       # Local data persistence
└── assets/              # Fonts, images
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `EXPO_PUBLIC_API_URL` | Key API server URL | Yes |

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Key App       │────▶│   Key API       │────▶│   Solana        │
│   (This Repo)   │     │   (Fee Payer)   │     │   Blockchain    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │ E2E Encrypted         │ Signs & Pays
        │ Messages              │ for Transactions
        ▼                       ▼
   Local Storage           Username Registry
```

## Security

- **Ed25519 Keypairs** - Solana-compatible identity
- **X25519 Key Exchange** - For message encryption
- **TweetNaCl** - Audited cryptographic library
- **Expo SecureStore** - Encrypted local key storage

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

---

**Built with ❤️ on Solana**
