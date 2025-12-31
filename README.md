# Position Sizer

A trading position size calculator that helps manage risk by calculating the correct position size based on your account equity, risk tolerance, and trade parameters.

## Features

- **Crypto & Equities** - Separate tabs with independent state for each asset type
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

# Run development server
npm run dev

# Build for production
npm run build
```

## Usage

1. Select asset type (Crypto or Equity)
2. Choose trade direction (Long or Short)
3. Enter your account equity and select currency
4. Set your risk percentage per trade
5. Enter or fetch the entry price
6. Set your stop loss price
7. Optionally set a target price or use R-multiple buttons

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
- Yahoo Finance API (stock prices)
- Frankfurter API (exchange rates)
