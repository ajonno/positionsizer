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

## Portfolio Dashboard Data

The portfolio dashboard uses a local bridge process so broker tokens stay out of
the browser bundle.

```bash
npm run portfolio:bridge
npm run dev
```

The default IBKR source is Flex Web Service, not Client Portal Gateway. Flex
downloads a configured report and does not create a competing brokerage session,
so it should not disconnect TWS, IBKR Desktop, IBKR Mobile, or other live
sessions.

Create an Activity Flex Query in IBKR Client Portal with XML output and include
at least the Open Positions section. Recommended Open Positions fields:

- Account ID
- Account Alias
- Currency
- Asset Class
- FX Rate to Base
- Symbol
- Description
- Conid
- Quantity
- Multiplier
- Mark Price
- Position Value
- Open Price
- Cost Basis Price
- Cost Basis Money
- FIFO Unrealized PNL
- Side
- Report Date

If you want cash on the heatmap, also include Cash Report with Currency and
Ending Cash. The bridge uses the `BASE_SUMMARY` cash row when present.

For one Flex query that includes both IBKR accounts:

```bash
IBKR_SOURCE_MODE=flex
IBKR_FLEX_TOKEN=...
IBKR_FLEX_QUERY_ID=...
IBKR_FLEX_BASE_CURRENCY=AUD
```

For two separate Flex queries:

```bash
IBKR_SOURCE_MODE=flex
IBKR_FLEX_TOKEN=...
IBKR_FLEX_BASE_CURRENCY=AUD
IBKR_FLEX_ACCOUNT_1_LABEL=IB SMSF
IBKR_FLEX_ACCOUNT_1_FILTER_ID=ib-smsf
IBKR_FLEX_ACCOUNT_1_QUERY_ID=...
IBKR_FLEX_ACCOUNT_2_LABEL=IB Personal
IBKR_FLEX_ACCOUNT_2_FILTER_ID=ib-personal
IBKR_FLEX_ACCOUNT_2_QUERY_ID=...
```

If the two accounts require different Flex tokens, set
`IBKR_FLEX_ACCOUNT_1_TOKEN` and `IBKR_FLEX_ACCOUNT_2_TOKEN`.

By default the bridge converts IBKR positions to the Flex report base currency
using `fxRateToBase`. Set `IBKR_FLEX_CONVERT_TO_BASE=false` if you want IBKR
positions left in instrument currency.

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
