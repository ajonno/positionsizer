# Position Sizer

A trading position size calculator that helps manage risk by calculating the correct position size based on your account equity, risk tolerance, and trade parameters.

## Features

- **Crypto, Equities & Futures** - Separate tabs with independent state for each asset type
- **E-mini Futures** - Contract-aware sizing for ES, MES, NQ, MNQ, YM, MYM, RTY, and M2K
- **Long & Short Trades** - Support for both trade directions with appropriate validation
- **Currency Conversion** - Automatic exchange rate fetching when account currency differs from asset currency
- **Live Price Fetching** - Get current prices from CoinGecko (crypto) or Yahoo Finance (stocks)
- **Target Price & R-Multiples** - Optional target with quick 1x, 2x, 3x, 5x buttons
- **Risk/Reward Display** - Shows potential profit and risk/reward ratio
- **PWA Support** - Works offline once installed

## Formula

```
Position Size = (Account Equity × Risk %) / |Entry Price - Stop Loss|
```

## Getting Started

```bash
# Install dependencies
npm install

# Add your Firebase web app config
cp .env.example .env.local

# Run development server
npm run dev

# Build for production
npm run build
```

Create `.env.local` with these variables from your Firebase web app:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Firebase setup required before sign-in works:

1. Create a Firebase project and web app.
2. Enable Google authentication in Firebase Authentication.
3. Add your local/dev hosting domains to the Firebase authorized domains list.

## Usage

1. Select asset type (Crypto, Equity, or Futures)
2. Choose trade direction (Long or Short)
3. Enter your account equity and select currency
4. Set your risk percentage per trade
5. For futures, choose the contract you want to size
6. Enter or fetch the entry price
7. Set your stop loss price
8. Optionally set a target price or use R-multiple buttons

The calculator will display:
- Position size (units/shares)
- Position value
- Risk amount in your account currency
- Potential profit (if target is set)
- Risk/reward ratio (if target is set)

## Tech Stack

- React + Vite
- PWA (vite-plugin-pwa)
- CoinGecko API (crypto prices)
- Yahoo Finance chart API (equity and futures prices)
- Frankfurter API (exchange rates)
