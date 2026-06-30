import { samplePortfolioSnapshot } from './samplePortfolioSnapshot'

const DEFAULT_DEV_API_BASE = '/trading-api'
const API_BASE_URL = (import.meta.env.VITE_TRADING_API_BASE_URL || '').trim()
const PORTFOLIO_BRIDGE_BASE_URL = (import.meta.env.VITE_PORTFOLIO_BRIDGE_BASE_URL || '').trim()
const DEV_API_KEY = import.meta.env.DEV ? (import.meta.env.VITE_TRADING_API_KEY || '').trim() : ''
const API_BASE = API_BASE_URL || (import.meta.env.DEV ? DEFAULT_DEV_API_BASE : '')
const PORTFOLIO_BRIDGE_BASE = PORTFOLIO_BRIDGE_BASE_URL || (import.meta.env.DEV ? '/portfolio-bridge' : '')

const IBKR_SOURCE = 'Interactive Brokers'
const HYPERLIQUID_SOURCE = 'Hyperliquid'

const ETF_SYMBOLS = new Set(['IBIT', 'SILJ', 'SLV', 'SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD'])
const FUTURES_SYMBOLS = new Set(['ES', 'MES', 'NQ', 'MNQ', 'YM', 'MYM', 'RTY', 'M2K', 'GC', 'MGC', 'SI', 'SIL'])
const PRECIOUS_METALS_SYMBOLS = new Set(['GLD', 'IAU', 'SLV', 'SIL', 'SILJ', 'GDX', 'GDXJ'])

const normalizeSide = (side) => {
  const normalized = String(side || '').toLowerCase()

  if (normalized === 'buy' || normalized === 'long') {
    return 'long'
  }

  if (normalized === 'sell' || normalized === 'short') {
    return 'short'
  }

  return normalized || 'neutral'
}

const inferSource = (exchange) => {
  const normalized = String(exchange || '').toLowerCase()

  if (normalized === 'ib' || normalized.includes('interactive')) {
    return IBKR_SOURCE
  }

  if (normalized.includes('hyperliquid')) {
    return HYPERLIQUID_SOURCE
  }

  return exchange || 'Unknown'
}

const inferAssetClass = (position, source) => {
  const symbol = String(position.symbol || '').toUpperCase()
  const description = String(position.description || '').toUpperCase()

  if (source === HYPERLIQUID_SOURCE) {
    return 'Crypto Perps'
  }

  if (description.includes('PERP PFD') || description.includes('PREFERRED')) {
    return 'Preferred Equity'
  }

  if (PRECIOUS_METALS_SYMBOLS.has(symbol) || description.includes('SILVER') || description.includes('GOLD')) {
    return 'Precious Metals'
  }

  if (FUTURES_SYMBOLS.has(symbol)) {
    return 'Futures'
  }

  if (ETF_SYMBOLS.has(symbol) || description.includes('ETF') || description.includes('TRUST')) {
    return 'ETFs'
  }

  return 'Equities'
}

const numericValue = (...values) => {
  for (const value of values) {
    const parsed = Number(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

const normalizePosition = (position, fallbackExchange) => {
  const exchange = position.exchange || fallbackExchange
  const source = inferSource(exchange)
  const side = normalizeSide(position.side)
  const quantity = Math.abs(numericValue(position.quantity, position.availableQuantity))
  const currentPrice = numericValue(position.currentPrice, position.entryPrice)
  const unsignedMarketValue = numericValue(position.availableValue) || quantity * currentPrice
  const signedMarketValue = side === 'short' ? -Math.abs(unsignedMarketValue) : Math.abs(unsignedMarketValue)
  const accountId = position.accountId || `${source.toLowerCase().replaceAll(' ', '-')}-primary`

  return {
    id: position.positionId || `${source}:${accountId}:${position.symbol}:${side}`,
    source,
    accountId,
    accountLabel: position.accountLabel || (source === IBKR_SOURCE ? 'IBKR Primary' : `${source} Primary`),
    assetClass: inferAssetClass(position, source),
    symbol: position.symbol || 'UNKNOWN',
    description: position.description || position.symbol || 'Position',
    side,
    quantity,
    averagePrice: numericValue(position.entryPrice),
    currentPrice,
    marketValue: signedMarketValue,
    pnl: numericValue(position.pnl),
    pnlPercent: numericValue(position.pnlPercentage),
    stopLoss: position.stopLoss ?? null,
    target: position.target ?? null,
    currency: 'USD',
    raw: position,
  }
}

const createAccounts = (positions) => {
  const accounts = new Map()

  for (const position of positions) {
    if (!accounts.has(position.accountId)) {
      accounts.set(position.accountId, {
        id: position.accountId,
        label: position.accountLabel,
        source: position.source,
        baseCurrency: position.currency,
      })
    }
  }

  return Array.from(accounts.values())
}

const fetchPositions = async (exchange) => {
  const headers = {
    Accept: 'application/json',
  }

  if (DEV_API_KEY) {
    headers['X-API-Key'] = DEV_API_KEY
  }

  const response = await fetch(`${API_BASE}/api/positions?network=live&exchange=${encodeURIComponent(exchange)}`, {
    headers,
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`${exchange} positions request failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }

  const payload = await response.json()
  return (payload.positions ?? []).map((position) => normalizePosition(position, exchange))
}

const loadFromPortfolioBridge = async () => {
  if (!PORTFOLIO_BRIDGE_BASE) {
    throw new Error('Portfolio bridge is not configured')
  }

  const response = await fetch(`${PORTFOLIO_BRIDGE_BASE}/api/portfolio/snapshot`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Portfolio bridge request failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }

  const payload = await response.json()

  if (!payload?.snapshot) {
    throw new Error('Portfolio bridge response did not include a snapshot')
  }

  return {
    snapshot: payload.snapshot,
    status: payload.status ?? {
      mode: 'live',
      message: 'Loaded live data from the local portfolio bridge.',
      refreshedAt: new Date().toISOString(),
      sources: [],
    },
  }
}

const loadFromCryptoTradeApi = async () => {
  if (!API_BASE) {
    throw new Error('CryptoTradeApi base URL is not configured')
  }

  const sourceRequests = [
    { key: 'hyperliquid', label: HYPERLIQUID_SOURCE },
    { key: 'ib', label: IBKR_SOURCE },
  ]
  const settled = await Promise.allSettled(sourceRequests.map((source) => fetchPositions(source.key)))
  const positions = []
  const sources = settled.map((result, index) => {
    const source = sourceRequests[index]

    if (result.status === 'fulfilled') {
      positions.push(...result.value)
      return {
        label: source.label,
        ok: true,
        count: result.value.length,
      }
    }

    return {
      label: source.label,
      ok: false,
      count: 0,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    }
  })

  const successfulSources = sources.filter((source) => source.ok)

  if (successfulSources.length === 0) {
    return {
      snapshot: samplePortfolioSnapshot,
      status: {
        mode: 'sample',
        message: 'Using sample data because CryptoTradeApi is unavailable.',
        refreshedAt: new Date().toISOString(),
        sources,
      },
    }
  }

  return {
    snapshot: {
      id: `crypto-trade-api-${Date.now()}`,
      currency: 'USD',
      asOf: new Date().toISOString(),
      accounts: createAccounts(positions),
      positions,
    },
    status: {
      mode: successfulSources.length === sourceRequests.length ? 'live' : 'partial',
      message: successfulSources.length === sourceRequests.length
        ? 'Loaded live Hyperliquid and IBKR positions from CryptoTradeApi.'
        : 'Loaded partial live data from CryptoTradeApi.',
      refreshedAt: new Date().toISOString(),
      sources,
    },
  }
}

export const loadPortfolioSnapshot = async () => {
  const errors = []

  try {
    return await loadFromPortfolioBridge()
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  try {
    return await loadFromCryptoTradeApi()
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  return {
    snapshot: samplePortfolioSnapshot,
    status: {
      mode: 'sample',
      message: `Using sample data because live data is unavailable. ${errors[0] ?? ''}`,
      refreshedAt: new Date().toISOString(),
      sources: [],
    },
  }
}
