import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { useAuth } from './auth-context'
import LoginPage from './LoginPage'

const PortfolioDashboard = lazy(() => import('./portfolio/PortfolioDashboard'))

const FIAT_CURRENCIES = ['USD', 'AUD', 'EUR', 'GBP', 'CAD', 'JPY', 'CHF', 'NZD']
const CRYPTO_ACCOUNT_CURRENCIES = ['USDC', 'USDT', 'USD', 'AUD', 'EUR', 'GBP']
const STABLECOINS = ['USDC', 'USDT', 'USD', 'BUSD', 'DAI']
const RISK_PERCENT_PRESETS = [0.5, 1, 2, 3, 4, 5]
const FUTURES_CONTRACTS = [
  { code: 'ES', name: 'E-mini S&P 500', yahooSymbol: 'ES=F', pointValue: 50, tickSize: 0.25, tickValue: 12.5, currency: 'USD' },
  { code: 'MES', name: 'Micro E-mini S&P 500', yahooSymbol: 'MES=F', pointValue: 5, tickSize: 0.25, tickValue: 1.25, currency: 'USD' },
  { code: 'NQ', name: 'E-mini Nasdaq-100', yahooSymbol: 'NQ=F', pointValue: 20, tickSize: 0.25, tickValue: 5, currency: 'USD' },
  { code: 'MNQ', name: 'Micro E-mini Nasdaq-100', yahooSymbol: 'MNQ=F', pointValue: 2, tickSize: 0.25, tickValue: 0.5, currency: 'USD' },
  { code: 'YM', name: 'E-mini Dow', yahooSymbol: 'YM=F', pointValue: 5, tickSize: 1, tickValue: 5, currency: 'USD' },
  { code: 'MYM', name: 'Micro E-mini Dow', yahooSymbol: 'MYM=F', pointValue: 0.5, tickSize: 1, tickValue: 0.5, currency: 'USD' },
  { code: 'RTY', name: 'E-mini Russell 2000', yahooSymbol: 'RTY=F', pointValue: 50, tickSize: 0.1, tickValue: 5, currency: 'USD' },
  { code: 'M2K', name: 'Micro E-mini Russell 2000', yahooSymbol: 'M2K=F', pointValue: 5, tickSize: 0.1, tickValue: 0.5, currency: 'USD' },
  // Coinbase Derivatives perpetual-style futures are quoted against a USD spot
  // index; Yahoo has no CDE symbols, so spot is fetched as a close proxy
  // (funding keeps the perp within a small basis of spot).
  { code: 'BIP', name: 'Nano Bitcoin Perp (Coinbase)', yahooSymbol: 'BTC-USD', priceSourceNote: 'BTC-USD spot index proxy', pointValue: 0.01, tickSize: 5, tickValue: 0.05, currency: 'USD' },
  { code: 'ETP', name: 'Nano Ether Perp (Coinbase)', yahooSymbol: 'ETH-USD', priceSourceNote: 'ETH-USD spot index proxy', pointValue: 0.1, tickSize: 0.5, tickValue: 0.05, currency: 'USD' },
  { code: '1OZ', name: '1-Ounce Gold', yahooSymbol: '1OZ=F', pointValue: 1, tickSize: 0.25, tickValue: 0.25, currency: 'USD' },
]
const FUTURES_CONTRACTS_BY_CODE = new Map(FUTURES_CONTRACTS.map((contract) => [contract.code, contract]))

// Map stablecoins to USD for exchange rate API
const toFiatCurrency = (currency) => {
  if (currency === 'USDC' || currency === 'USDT' || currency === 'BUSD' || currency === 'DAI') {
    return 'USD'
  }
  return currency
}

// Common crypto symbol to CoinGecko ID mapping
const CRYPTO_IDS = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'DOGE': 'dogecoin',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'AVAX': 'avalanche-2',
  'DOT': 'polkadot',
  'MATIC': 'matic-network',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'ATOM': 'cosmos',
  'LTC': 'litecoin',
  'BCH': 'bitcoin-cash',
  'NEAR': 'near',
  'APT': 'aptos',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'INJ': 'injective-protocol',
  'SUI': 'sui',
  'SEI': 'sei-network',
  'TIA': 'celestia',
  'JUP': 'jupiter-exchange-solana',
  'WIF': 'dogwifcoin',
  'PEPE': 'pepe',
  'SHIB': 'shiba-inu',
  'BONK': 'bonk',
}

const resolvedCryptoIds = new Map(Object.entries(CRYPTO_IDS))

const getBestCoinGeckoMatch = (coins, symbol) => {
  const normalizedSymbol = symbol.toUpperCase()
  const exactSymbolMatches = coins
    .filter((coin) => coin.symbol?.toUpperCase() === normalizedSymbol)
    .sort((a, b) => (a.market_cap_rank ?? Number.MAX_SAFE_INTEGER) - (b.market_cap_rank ?? Number.MAX_SAFE_INTEGER))

  if (exactSymbolMatches.length > 0) {
    return exactSymbolMatches[0]
  }

  return coins[0] ?? null
}

const parseJinaJsonPayload = async (response) => {
  const text = await response.text()
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error('Malformed quote response')
  }

  return JSON.parse(text.slice(jsonStart, jsonEnd + 1))
}

const fetchWithTimeout = async (url, timeoutMs = 8000) => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    window.clearTimeout(timeoutId)
  }
}

const fetchYahooChartData = async (ticker) => {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`

  try {
    const jinaResponse = await fetchWithTimeout(
      `https://r.jina.ai/http://${yahooUrl.replace(/^https?:\/\//, '')}`
    )

    if (!jinaResponse.ok) {
      throw new Error('Jina request failed')
    }

    return parseJinaJsonPayload(jinaResponse)
  } catch (jinaError) {
    const allOriginsResponse = await fetchWithTimeout(
      `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`
    )

    if (!allOriginsResponse.ok) {
      throw jinaError
    }

    const payload = await allOriginsResponse.json()

    if (!payload?.contents) {
      throw new Error('AllOrigins payload missing contents')
    }

    return JSON.parse(payload.contents)
  }
}

// FX rate with fallback: Frankfurter (ECB rates, daily) first, then
// open.er-api.com. The old api.frankfurter.app host now 301-redirects and
// breaks fetch, so we target the current api.frankfurter.dev/v1 endpoint.
const fetchFxRate = async (fromCurrency, toCurrency) => {
  try {
    const response = await fetchWithTimeout(
      `https://api.frankfurter.dev/v1/latest?base=${fromCurrency}&symbols=${toCurrency}`
    )

    if (response.ok) {
      const data = await response.json()
      const rate = data?.rates?.[toCurrency]

      if (typeof rate === 'number' && rate > 0) {
        return rate
      }
    }
  } catch (err) {
    console.warn('Frankfurter FX fetch failed, trying fallback:', err)
  }

  const response = await fetchWithTimeout(`https://open.er-api.com/v6/latest/${fromCurrency}`)

  if (!response.ok) {
    throw new Error('FX rate request failed')
  }

  const data = await response.json()
  const rate = data?.rates?.[toCurrency]

  if (typeof rate === 'number' && rate > 0) {
    return rate
  }

  throw new Error('Rate not found')
}

const isPriceAlignedToTick = (value, tickSize) => {
  const roundedToTick = Math.round(value / tickSize) * tickSize
  return Math.abs(roundedToTick - value) < tickSize / 1000
}

// Snap a fetched price to the contract's tick grid. Needed for contracts whose
// live price is a spot-index proxy (BIP/ETP) — spot rarely lands on the perp's
// tick — and harmless for prices that are already aligned.
const snapPriceToTick = (value, tickSize) => {
  const tickDecimals = (String(tickSize).split('.')[1] || '').length
  return Number((Math.round(value / tickSize) * tickSize).toFixed(tickDecimals))
}

function App() {
  const { user, loading, logout } = useAuth()
  const [activeView, setActiveView] = useState('calculator')
  const [assetType, setAssetType] = useState('crypto')
  const [tradeDirection, setTradeDirection] = useState('long')

  // Separate state for crypto
  const [cryptoEquity, setCryptoEquity] = useState('')
  const [cryptoRiskPercent, setCryptoRiskPercent] = useState('')
  const [cryptoEntryPrice, setCryptoEntryPrice] = useState('')
  const [cryptoStopPrice, setCryptoStopPrice] = useState('')
  const [cryptoTargetPrice, setCryptoTargetPrice] = useState('')
  const [cryptoAccountCurrency, setCryptoAccountCurrency] = useState('USDC')
  const [cryptoSymbol, setCryptoSymbol] = useState('BTC')
  const [quoteCurrency, setQuoteCurrency] = useState('USDC')

  // Separate state for equity
  const [equityEquity, setEquityEquity] = useState('')
  const [equityRiskPercent, setEquityRiskPercent] = useState('')
  const [equityEntryPrice, setEquityEntryPrice] = useState('')
  const [equityStopPrice, setEquityStopPrice] = useState('')
  const [equityTargetPrice, setEquityTargetPrice] = useState('')
  const [equityAccountCurrency, setEquityAccountCurrency] = useState('USD')
  const [assetCurrency, setAssetCurrency] = useState('USD')
  const [stockTicker, setStockTicker] = useState('')
  const [futuresEquity, setFuturesEquity] = useState('')
  const [futuresRiskPercent, setFuturesRiskPercent] = useState('')
  const [futuresEntryPrice, setFuturesEntryPrice] = useState('')
  const [futuresStopPrice, setFuturesStopPrice] = useState('')
  const [futuresTargetPrice, setFuturesTargetPrice] = useState('')
  const [futuresAccountCurrency, setFuturesAccountCurrency] = useState('USD')
  const [futuresContractCode, setFuturesContractCode] = useState('ES')

  const isCrypto = assetType === 'crypto'
  const isEquity = assetType === 'equity'
  const isFutures = assetType === 'futures'
  const isDashboard = activeView === 'dashboard'
  const activeFuturesContract = FUTURES_CONTRACTS_BY_CODE.get(futuresContractCode) ?? FUTURES_CONTRACTS[0]

  // Derived state based on current asset type
  const equity = isCrypto ? cryptoEquity : isEquity ? equityEquity : futuresEquity
  const setEquity = isCrypto ? setCryptoEquity : isEquity ? setEquityEquity : setFuturesEquity
  const riskPercent = isCrypto ? cryptoRiskPercent : isEquity ? equityRiskPercent : futuresRiskPercent
  const setRiskPercent = isCrypto ? setCryptoRiskPercent : isEquity ? setEquityRiskPercent : setFuturesRiskPercent
  const entryPrice = isCrypto ? cryptoEntryPrice : isEquity ? equityEntryPrice : futuresEntryPrice
  const setEntryPrice = isCrypto ? setCryptoEntryPrice : isEquity ? setEquityEntryPrice : setFuturesEntryPrice
  const stopPrice = isCrypto ? cryptoStopPrice : isEquity ? equityStopPrice : futuresStopPrice
  const setStopPrice = isCrypto ? setCryptoStopPrice : isEquity ? setEquityStopPrice : setFuturesStopPrice
  const targetPrice = isCrypto ? cryptoTargetPrice : isEquity ? equityTargetPrice : futuresTargetPrice
  const setTargetPrice = isCrypto ? setCryptoTargetPrice : isEquity ? setEquityTargetPrice : setFuturesTargetPrice
  const accountCurrency = isCrypto ? cryptoAccountCurrency : isEquity ? equityAccountCurrency : futuresAccountCurrency
  const setAccountCurrency = isCrypto ? setCryptoAccountCurrency : isEquity ? setEquityAccountCurrency : setFuturesAccountCurrency
  const [exchangeRate, setExchangeRate] = useState('')
  const rateRequestIdRef = useRef(0)
  const [rateLoading, setRateLoading] = useState(false)
  const [rateError, setRateError] = useState(null)
  const [rateLastUpdated, setRateLastUpdated] = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceError, setPriceError] = useState(null)
  const [fetchedPrice, setFetchedPrice] = useState(null)
  const [isTrackingLiveFuturesEntry, setIsTrackingLiveFuturesEntry] = useState(true)
  const [result, setResult] = useState(null)

  const displayCurrency = isCrypto ? quoteCurrency : isFutures ? activeFuturesContract.currency : assetCurrency
  const targetCurrency = isCrypto ? toFiatCurrency(displayCurrency) : displayCurrency
  const accountCurrencyFiat = toFiatCurrency(accountCurrency)
  const needsConversion = accountCurrencyFiat !== targetCurrency
  const priceInputStep = isFutures ? activeFuturesContract.tickSize : 'any'
  const futuresPointDecimals = activeFuturesContract.tickSize < 1 ? 2 : 0

  const fetchExchangeRate = async (fromCurrency, toCurrency) => {
    const requestId = ++rateRequestIdRef.current

    if (fromCurrency === toCurrency) {
      setExchangeRate('1')
      setRateLastUpdated(null)
      setRateError(null)
      return
    }

    setRateLoading(true)
    setRateError(null)
    // Clear the previous pair's rate so the calculator suppresses results
    // (instead of silently sizing with a stale rate) until this fetch lands.
    setExchangeRate('')

    try {
      const rate = await fetchFxRate(fromCurrency, toCurrency)

      // A newer request (currency changed again) supersedes this one.
      if (rateRequestIdRef.current !== requestId) {
        return
      }

      setExchangeRate(rate.toString())
      setRateLastUpdated(new Date())
    } catch (err) {
      if (rateRequestIdRef.current !== requestId) {
        return
      }

      setRateError('Could not fetch rate - enter it manually')
      console.error('Exchange rate fetch error:', err)
    } finally {
      if (rateRequestIdRef.current === requestId) {
        setRateLoading(false)
      }
    }
  }

  // Fetch crypto price from CoinGecko
  const fetchCryptoPrice = async () => {
    const symbol = cryptoSymbol.trim().toUpperCase()

    if (!symbol) {
      setPriceError('Enter a crypto symbol')
      return
    }

    setPriceLoading(true)
    setPriceError(null)

    try {
      let coinId = resolvedCryptoIds.get(symbol)

      if (!coinId) {
        const searchResponse = await fetch(
          `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`
        )

        if (!searchResponse.ok) {
          throw new Error('Failed to search for coin')
        }

        const searchData = await searchResponse.json()
        const bestMatch = getBestCoinGeckoMatch(searchData.coins ?? [], symbol)

        if (!bestMatch?.id) {
          throw new Error('Price not found - check symbol')
        }

        coinId = bestMatch.id
        resolvedCryptoIds.set(symbol, coinId)
      }

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch price')
      }

      const data = await response.json()
      const price = data[coinId]?.usd

      if (price) {
        setEntryPrice(price.toString())
        setFetchedPrice(price)
      } else {
        throw new Error('Price not found - check symbol')
      }
    } catch (err) {
      setPriceError('Could not fetch price')
      console.error('Crypto price fetch error:', err)
    } finally {
      setPriceLoading(false)
    }
  }

  // Fetch stock price from Yahoo Finance via a browser-safe reader endpoint
  const fetchStockPrice = async () => {
    const ticker = stockTicker.trim().toUpperCase()

    if (!ticker) {
      setPriceError('Enter a ticker symbol')
      return
    }

    setPriceLoading(true)
    setPriceError(null)

    try {
      const data = await fetchYahooChartData(ticker)
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice

      if (price) {
        setEntryPrice(price.toString())
        setFetchedPrice(price)
        // Also set the currency based on the stock's currency
        const currency = data.chart?.result?.[0]?.meta?.currency
        if (currency && FIAT_CURRENCIES.includes(currency)) {
          setAssetCurrency(currency)
        }
      } else {
        throw new Error('Price not found - check ticker')
      }
    } catch (err) {
      setPriceError('Could not fetch price - check ticker')
      console.error('Stock price fetch error:', err)
    } finally {
      setPriceLoading(false)
    }
  }

  const fetchFuturesPrice = useCallback(async ({ updateEntry = true } = {}) => {
    setPriceLoading(true)
    setPriceError(null)

    try {
      const data = await fetchYahooChartData(activeFuturesContract.yahooSymbol)
      const rawPrice = data.chart?.result?.[0]?.meta?.regularMarketPrice

      if (rawPrice) {
        const price = snapPriceToTick(rawPrice, activeFuturesContract.tickSize)

        if (updateEntry) {
          setEntryPrice(price.toString())
        }
        setFetchedPrice(price)
      } else {
        throw new Error('Price not found for contract')
      }
    } catch (err) {
      setPriceError(`Could not fetch ${activeFuturesContract.code} price`)
      console.error('Futures price fetch error:', err)
    } finally {
      setPriceLoading(false)
    }
  }, [activeFuturesContract, setEntryPrice])

  const fetchPrice = () => {
    if (isCrypto) {
      fetchCryptoPrice()
    } else if (isEquity) {
      fetchStockPrice()
    } else {
      setIsTrackingLiveFuturesEntry(true)
      fetchFuturesPrice()
    }
  }

  // Auto-fetch rate when currencies change
  useEffect(() => {
    fetchExchangeRate(accountCurrencyFiat, targetCurrency)
  }, [accountCurrencyFiat, targetCurrency])


  // Clear fetched price when symbol changes
  useEffect(() => {
    setFetchedPrice(null)
    setPriceError(null)
  }, [cryptoSymbol, stockTicker, futuresContractCode, assetType])

  useEffect(() => {
    if (isFutures) {
      setIsTrackingLiveFuturesEntry(true)
      fetchFuturesPrice()
    }
  }, [fetchFuturesPrice, futuresContractCode, isFutures])

  useEffect(() => {
    if (!isFutures || !isTrackingLiveFuturesEntry) {
      return
    }

    const intervalId = window.setInterval(() => {
      fetchFuturesPrice()
    }, 15000)

    return () => window.clearInterval(intervalId)
  }, [fetchFuturesPrice, isFutures, isTrackingLiveFuturesEntry])

  const handleStockTickerBlur = () => {
    if (!stockTicker.trim() || priceLoading) {
      return
    }

    fetchStockPrice()
  }

  const handleEntryPriceChange = (value) => {
    if (isFutures) {
      setIsTrackingLiveFuturesEntry(false)
    }

    setEntryPrice(value)
  }

  const calculatePositionSize = useCallback(() => {
    const equityVal = parseFloat(equity)
    const riskVal = parseFloat(riskPercent)
    const entryVal = parseFloat(entryPrice)
    const stopVal = parseFloat(stopPrice)
    const rateVal = parseFloat(exchangeRate)

    if (isNaN(equityVal) || isNaN(riskVal) || isNaN(entryVal) || isNaN(stopVal)) {
      setResult(null)
      return
    }

    if (needsConversion && isNaN(rateVal)) {
      setResult(null)
      return
    }

    if (entryVal === stopVal) {
      setResult({ error: 'Entry and stop cannot be the same' })
      return
    }

    if (tradeDirection === 'long' && stopVal >= entryVal) {
      setResult({ error: 'For a long, stop loss must be below entry price' })
      return
    }

    if (tradeDirection === 'short' && stopVal <= entryVal) {
      setResult({ error: 'For a short, stop loss must be above entry price' })
      return
    }

    // Validate target price if provided
    const targetVal = parseFloat(targetPrice)
    const hasTarget = !isNaN(targetVal) && targetPrice !== ''

    if (hasTarget) {
      if (tradeDirection === 'long' && targetVal <= entryVal) {
        setResult({ error: 'For a long, target must be above entry price' })
        return
      }
      if (tradeDirection === 'short' && targetVal >= entryVal) {
        setResult({ error: 'For a short, target must be below entry price' })
        return
      }
    }

    if (needsConversion && rateVal <= 0) {
      setResult({ error: 'Exchange rate must be greater than 0' })
      return
    }

    if (isFutures) {
      const invalidPriceLabel = hasTarget && !isPriceAlignedToTick(targetVal, activeFuturesContract.tickSize)
        ? 'target'
        : !isPriceAlignedToTick(entryVal, activeFuturesContract.tickSize)
          ? 'entry'
          : !isPriceAlignedToTick(stopVal, activeFuturesContract.tickSize)
            ? 'stop'
            : null

      if (invalidPriceLabel) {
        setResult({
          error: `${activeFuturesContract.code} prices must align to ${activeFuturesContract.tickSize} point ticks (${invalidPriceLabel} price is off tick)`,
        })
        return
      }
    }

    // Risk amount in account currency
    const riskAmountAccount = equityVal * (riskVal / 100)

    // Convert risk amount to target currency if needed
    const effectiveRate = needsConversion ? rateVal : 1
    const riskAmountTarget = riskAmountAccount * effectiveRate

    const stopDistance = Math.abs(entryVal - stopVal)

    if (isFutures) {
      const riskPerContract = stopDistance * activeFuturesContract.pointValue
      const positionSizeExact = riskAmountTarget / riskPerContract
      const positionSize = Math.floor(positionSizeExact)
      const positionValue = positionSize * entryVal * activeFuturesContract.pointValue
      const actualRiskTarget = positionSize * riskPerContract
      const actualRiskAccount = actualRiskTarget / effectiveRate
      const maxStopDistance = Math.floor(
        (riskAmountTarget / activeFuturesContract.pointValue) / activeFuturesContract.tickSize
      ) * activeFuturesContract.tickSize

      let profitAmount = null
      let profitAmountAccount = null
      let rFactor = null

      if (hasTarget) {
        const profitPerContract = Math.abs(targetVal - entryVal) * activeFuturesContract.pointValue
        profitAmount = positionSize * profitPerContract
        profitAmountAccount = profitAmount / effectiveRate
        rFactor = profitPerContract / riskPerContract
      }

      setResult({
        positionSize,
        positionSizeExact,
        positionValue,
        riskAmountAccount,
        riskAmountTarget,
        riskPerUnit: riskPerContract,
        stopDistance,
        actualRiskTarget,
        actualRiskAccount,
        maxStopDistance,
        profitAmount,
        profitAmountAccount,
        rFactor,
      })
      return
    }

    const riskPerUnit = stopDistance
    const positionSize = riskAmountTarget / riskPerUnit
    const positionValue = positionSize * entryVal

    // Calculate profit and R factor if target is set
    let profitAmount = null
    let profitAmountAccount = null
    let rFactor = null

    if (hasTarget) {
      const profitPerUnit = Math.abs(targetVal - entryVal)
      profitAmount = positionSize * profitPerUnit
      profitAmountAccount = profitAmount / effectiveRate
      rFactor = profitPerUnit / riskPerUnit
    }

    setResult({
      positionSize: positionSize,
      positionValue: positionValue,
      riskAmountAccount: riskAmountAccount,
      riskAmountTarget: riskAmountTarget,
      riskPerUnit: riskPerUnit,
      profitAmount: profitAmount,
      profitAmountAccount: profitAmountAccount,
      rFactor: rFactor,
    })
  }, [
    activeFuturesContract,
    entryPrice,
    equity,
    exchangeRate,
    isFutures,
    needsConversion,
    riskPercent,
    stopPrice,
    targetPrice,
    tradeDirection,
  ])

  useEffect(() => {
    calculatePositionSize()
  }, [calculatePositionSize])

  const formatNumber = (num, decimals = 2) => {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }

  // Crypto and fractional-share venues can support very small quantities.
  const formatFractionalQuantity = (num) => {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8
    })
  }

  const formatTime = (date) => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="spinner"></div>
        </div>
      </div>
    )
  }

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage />
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div>
            <h1>Position Sizer</h1>
            <p className="subtitle">Signed in as {user.email}</p>
            <nav className="app-tabs" aria-label="Primary views">
              <button
                type="button"
                className={activeView === 'calculator' ? 'active' : ''}
                onClick={() => setActiveView('calculator')}
              >
                Calculator
              </button>
              <button
                type="button"
                className={isDashboard ? 'active' : ''}
                onClick={() => setActiveView('dashboard')}
              >
                Dashboard
              </button>
            </nav>
          </div>
          <button className="logout-btn" onClick={logout} title="Sign out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {isDashboard ? (
        <main className="portfolio-dashboard">
          <Suspense fallback={<div className="treemap-loading">Loading dashboard...</div>}>
            <PortfolioDashboard />
          </Suspense>
        </main>
      ) : (
      <main className="calculator">
        <div className="toggle-group">
          <div className="toggle-section">
            <label>Asset Type</label>
            <div className="toggle-buttons">
              <button
                className={isCrypto ? 'active' : ''}
                onClick={() => setAssetType('crypto')}
              >
                Crypto
              </button>
              <button
                className={isEquity ? 'active' : ''}
                onClick={() => setAssetType('equity')}
              >
                Equity
              </button>
              <button
                className={isFutures ? 'active' : ''}
                onClick={() => setAssetType('futures')}
              >
                Futures
              </button>
            </div>
          </div>

          <div className="toggle-section">
            <label>Direction</label>
            <div className="toggle-buttons">
              <button
                className={tradeDirection === 'long' ? 'active long' : ''}
                onClick={() => setTradeDirection('long')}
              >
                Long
              </button>
              <button
                className={tradeDirection === 'short' ? 'active short' : ''}
                onClick={() => setTradeDirection('short')}
              >
                Short
              </button>
            </div>
          </div>
        </div>

        <div className="input-row">
          <div className="input-group flex-grow">
            <label htmlFor="equity">Account Equity</label>
            <input
              id="equity"
              type="number"
              placeholder="e.g. 10000"
              value={equity}
              onChange={(e) => setEquity(e.target.value)}
              min="0"
              step="any"
            />
          </div>
          <div className="input-group currency-select">
            <label htmlFor="accountCurrency">Currency</label>
            <select
              id="accountCurrency"
              value={accountCurrency}
              onChange={(e) => setAccountCurrency(e.target.value)}
            >
              {(isCrypto ? CRYPTO_ACCOUNT_CURRENCIES : FIAT_CURRENCIES).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="input-group">
          <label htmlFor="risk">Risk per Trade (%)</label>
          <input
            id="risk"
            type="number"
            placeholder="e.g. 1"
            value={riskPercent}
            onChange={(e) => setRiskPercent(e.target.value)}
            min="0"
            max="100"
            step="any"
          />
          <div className="preset-buttons">
            {RISK_PERCENT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`preset-btn ${riskPercent === preset.toString() ? 'active' : ''}`}
                onClick={() => setRiskPercent(preset.toString())}
              >
                {preset}%
              </button>
            ))}
          </div>
        </div>

        {isCrypto ? (
          <div className="input-row">
            <div className="input-group flex-grow">
              <label htmlFor="cryptoSymbol">Asset Symbol</label>
              <input
                id="cryptoSymbol"
                type="text"
                placeholder="e.g. BTC"
                value={cryptoSymbol}
                onChange={(e) => setCryptoSymbol(e.target.value.toUpperCase())}
              />
            </div>
            <div className="input-group currency-select">
              <label htmlFor="quoteCurrency">Quote</label>
              <select
                id="quoteCurrency"
                value={quoteCurrency}
                onChange={(e) => setQuoteCurrency(e.target.value)}
              >
                {STABLECOINS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        ) : isEquity ? (
          <div className="input-group">
            <label htmlFor="stockTicker">Stock Ticker</label>
            <input
              id="stockTicker"
              type="text"
              placeholder="e.g. AAPL, TSLA, IBIT"
              value={stockTicker}
              onChange={(e) => setStockTicker(e.target.value.toUpperCase())}
              onBlur={handleStockTickerBlur}
            />
          </div>
        ) : (
          <div className="input-group">
            <label htmlFor="futuresContract">Futures Contract</label>
            <select
              id="futuresContract"
              value={futuresContractCode}
              onChange={(e) => setFuturesContractCode(e.target.value)}
            >
              {FUTURES_CONTRACTS.map((contract) => (
                <option key={contract.code} value={contract.code}>
                  {contract.code} - {contract.name}
                </option>
              ))}
            </select>
            <div className="contract-meta">
              <span>{activeFuturesContract.name}</span>
              <span>{displayCurrency} {formatNumber(activeFuturesContract.pointValue)} / point</span>
              <span>{activeFuturesContract.tickSize} tick ({displayCurrency} {formatNumber(activeFuturesContract.tickValue)})</span>
              {activeFuturesContract.priceSourceNote && (
                <span>Live price via {activeFuturesContract.priceSourceNote}</span>
              )}
            </div>
          </div>
        )}

        <div className="input-group">
          <div className="price-header">
            <label htmlFor="entry">
              Entry Price {displayCurrency ? `(${displayCurrency})` : ''}
            </label>
            <button
              className="fetch-price-btn"
              onClick={fetchPrice}
              disabled={priceLoading}
              title="Fetch current price"
            >
              {priceLoading ? (
                <span className="spinner"></span>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  Fetch ({isCrypto ? 'CoinGecko' : 'Yahoo'})
                </>
              )}
            </button>
          </div>
          <div className="input-row">
            <input
              id="entry"
              type="number"
              placeholder={fetchedPrice ? `Current: ${fetchedPrice}` : 'e.g. 88000'}
              value={entryPrice}
              onChange={(e) => handleEntryPriceChange(e.target.value)}
              min="0"
              step={priceInputStep}
              className="flex-grow"
            />
            {isEquity && (
              <div className="input-group currency-select" style={{ marginBottom: 0 }}>
                <select
                  id="assetCurrency"
                  value={assetCurrency}
                  onChange={(e) => setAssetCurrency(e.target.value)}
                >
                  {FIAT_CURRENCIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {isFutures && (
            <span className="price-hint">
              {isTrackingLiveFuturesEntry
                ? 'Tracking live futures price every 15 seconds'
                : 'Live price tracking paused while you use a custom entry. Press Fetch to resume.'}
            </span>
          )}
          {priceError && <span className="price-error">{priceError}</span>}
        </div>

        <div className="input-group">
          <label htmlFor="stop">
            Stop Loss Price ({displayCurrency})
          </label>
          <input
            id="stop"
            type="number"
            placeholder={tradeDirection === 'long' ? 'e.g. 85000 (below entry)' : 'e.g. 92000 (above entry)'}
            value={stopPrice}
            onChange={(e) => setStopPrice(e.target.value)}
            min="0"
            step={priceInputStep}
          />
        </div>

        <div className="input-group">
          <label htmlFor="target">
            Target Price ({displayCurrency}) <span className="optional-label">optional</span>
          </label>
          <input
            id="target"
            type="number"
            placeholder={tradeDirection === 'long' ? 'e.g. 95000 (above entry)' : 'e.g. 80000 (below entry)'}
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            min="0"
            step={priceInputStep}
          />
          <div className="r-buttons">
            {[1, 2, 3, 5].map((r) => (
              <button
                key={r}
                type="button"
                className="r-btn"
                onClick={() => {
                  const entry = parseFloat(entryPrice)
                  const stop = parseFloat(stopPrice)
                  if (!isNaN(entry) && !isNaN(stop) && entry !== stop) {
                    const riskPerUnit = Math.abs(entry - stop)
                    let target = tradeDirection === 'long'
                      ? entry + (r * riskPerUnit)
                      : entry - (r * riskPerUnit)

                    if (isFutures) {
                      target = Math.round(target / activeFuturesContract.tickSize) * activeFuturesContract.tickSize
                    } else {
                      const decimals = isCrypto ? 8 : 2
                      target = Math.round(target * Math.pow(10, decimals)) / Math.pow(10, decimals)
                    }

                    setTargetPrice(target.toString())
                  }
                }}
                disabled={!entryPrice || !stopPrice}
              >
                {r}x
              </button>
            ))}
          </div>
        </div>

        {needsConversion && (
          <div className="input-group exchange-rate">
            <div className="rate-header">
              <label htmlFor="rate">
                Exchange Rate (1 {accountCurrency} = ? {targetCurrency})
              </label>
              <button
                className="refresh-btn"
                onClick={() => fetchExchangeRate(accountCurrencyFiat, targetCurrency)}
                disabled={rateLoading}
                title="Refresh rate"
              >
                {rateLoading ? (
                  <span className="spinner"></span>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                )}
              </button>
            </div>
            <input
              id="rate"
              type="number"
              placeholder={rateLoading ? 'Loading...' : 'e.g. 0.65'}
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              min="0"
              step="any"
            />
            <div className="rate-footer">
              {rateError && <span className="rate-error">{rateError}</span>}
              {rateLastUpdated && !rateError && (
                <span className="rate-hint">
                  Live rate updated at {formatTime(rateLastUpdated)}
                </span>
              )}
              {!rateLastUpdated && !rateError && !needsConversion && (
                <span className="rate-hint">
                  Same currency - no conversion needed
                </span>
              )}
            </div>
          </div>
        )}

        {result && !result.error && (
          <div className="results">
            <h2>Results</h2>
            <div className="result-grid">
              {assetType === 'crypto' ? (
                <>
                  <div className="result-item highlight">
                    <span className="result-label">Size in {cryptoSymbol || 'Units'}</span>
                    <span className="result-value">
                      {formatFractionalQuantity(result.positionSize)} {cryptoSymbol || 'units'}
                    </span>
                  </div>
                  <div className="result-item highlight-secondary">
                    <span className="result-label">Size in {quoteCurrency}</span>
                    <span className="result-value">
                      {formatNumber(result.positionValue, 2)} {quoteCurrency}
                    </span>
                  </div>
                </>
              ) : isFutures ? (
                <>
                  <div className="result-item highlight">
                    <span className="result-label">Max Contracts</span>
                    <span className="result-value">
                      {formatNumber(result.positionSize, 0)} contracts
                    </span>
                    <span className="converted-value">
                      {result.positionSize > 0 && Math.abs(result.positionSizeExact - result.positionSize) < 0.0001
                        ? `Raw size ${formatNumber(result.positionSizeExact, 2)} contracts`
                        : result.positionSize > 0
                          ? `Raw size ${formatNumber(result.positionSizeExact, 2)} contracts, rounded down to whole contracts`
                          : `Raw size ${formatNumber(result.positionSizeExact, 2)} contracts, below the minimum 1-contract size`}
                    </span>
                  </div>
                  <div className="result-item highlight-secondary">
                    <span className="result-label">Notional Value</span>
                    <span className="result-value">
                      {displayCurrency} {formatNumber(result.positionValue)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="result-item highlight">
                    <span className="result-label">Position Size</span>
                    <span className="result-value">
                      {formatFractionalQuantity(result.positionSize)} shares
                    </span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">Position Value</span>
                    <span className="result-value">{assetCurrency} {formatNumber(result.positionValue)}</span>
                  </div>
                </>
              )}
              <div className="result-item">
                <span className="result-label">Risk Amount</span>
                <span className="result-value">
                  {accountCurrency} {formatNumber(result.riskAmountAccount)}
                  {needsConversion && (
                    <span className="converted-value">
                      ({displayCurrency} {formatNumber(result.riskAmountTarget)})
                    </span>
                  )}
                </span>
              </div>
              <div className="result-item">
                <span className="result-label">
                  {isFutures ? 'Risk per Contract' : `Risk per ${isCrypto ? cryptoSymbol || 'Unit' : 'Share'}`}
                </span>
                <span className="result-value">{displayCurrency} {formatNumber(result.riskPerUnit)}</span>
              </div>
              {isFutures && (
                <>
                  <div className="result-item">
                    <span className="result-label">Stop Distance</span>
                    <span className="result-value">{formatNumber(result.stopDistance, futuresPointDecimals)} points</span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">Max 1-Contract Stop</span>
                    <span className="result-value">{formatNumber(result.maxStopDistance, futuresPointDecimals)} points</span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">Actual Risk</span>
                    <span className="result-value">
                      {accountCurrency} {formatNumber(result.actualRiskAccount)}
                      {needsConversion && (
                        <span className="converted-value">
                          ({displayCurrency} {formatNumber(result.actualRiskTarget)})
                        </span>
                      )}
                    </span>
                  </div>
                </>
              )}
              {result.profitAmount !== null && (
                <>
                  <div className="result-item profit">
                    <span className="result-label">Potential Profit</span>
                    <span className="result-value profit-value">
                      +{accountCurrency} {formatNumber(needsConversion ? result.profitAmountAccount : result.profitAmount)}
                      {needsConversion && (
                        <span className="converted-value">
                          ({displayCurrency} {formatNumber(result.profitAmount)})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="result-item r-factor">
                    <span className="result-label">Risk/Reward</span>
                    <span className="result-value r-value">
                      {result.rFactor.toFixed(2)}x
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {result && result.error && (
          <div className="error-message">
            {result.error}
          </div>
        )}

        <div className="formula">
          <h3>Formula</h3>
          <code>
            {isFutures
              ? 'Contracts = (Equity × Risk% × Rate) / (|Entry - Stop| × $/point)'
              : 'Size = (Equity × Risk% × Rate) / |Entry - Stop|'}
          </code>
        </div>
      </main>
      )}

      <footer className="footer">
        <p>Works offline - Install as app for best experience</p>
      </footer>
    </div>
  )
}

export default App
