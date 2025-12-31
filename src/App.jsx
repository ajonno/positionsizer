import { useState, useEffect } from 'react'
import './App.css'
import { useAuth } from './AuthContext'
import LoginPage from './LoginPage'

const FIAT_CURRENCIES = ['USD', 'AUD', 'EUR', 'GBP', 'CAD', 'JPY', 'CHF', 'NZD']
const CRYPTO_ACCOUNT_CURRENCIES = ['USDC', 'USDT', 'USD', 'AUD', 'EUR', 'GBP']
const STABLECOINS = ['USDC', 'USDT', 'USD', 'BUSD', 'DAI']

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

function App() {
  const { user, loading, logout } = useAuth()
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

  // Derived state based on current asset type
  const equity = assetType === 'crypto' ? cryptoEquity : equityEquity
  const setEquity = assetType === 'crypto' ? setCryptoEquity : setEquityEquity
  const riskPercent = assetType === 'crypto' ? cryptoRiskPercent : equityRiskPercent
  const setRiskPercent = assetType === 'crypto' ? setCryptoRiskPercent : setEquityRiskPercent
  const entryPrice = assetType === 'crypto' ? cryptoEntryPrice : equityEntryPrice
  const setEntryPrice = assetType === 'crypto' ? setCryptoEntryPrice : setEquityEntryPrice
  const stopPrice = assetType === 'crypto' ? cryptoStopPrice : equityStopPrice
  const setStopPrice = assetType === 'crypto' ? setCryptoStopPrice : setEquityStopPrice
  const targetPrice = assetType === 'crypto' ? cryptoTargetPrice : equityTargetPrice
  const setTargetPrice = assetType === 'crypto' ? setCryptoTargetPrice : setEquityTargetPrice
  const accountCurrency = assetType === 'crypto' ? cryptoAccountCurrency : equityAccountCurrency
  const setAccountCurrency = assetType === 'crypto' ? setCryptoAccountCurrency : setEquityAccountCurrency
  const [exchangeRate, setExchangeRate] = useState('')
  const [rateLoading, setRateLoading] = useState(false)
  const [rateError, setRateError] = useState(null)
  const [rateLastUpdated, setRateLastUpdated] = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceError, setPriceError] = useState(null)
  const [fetchedPrice, setFetchedPrice] = useState(null)
  const [result, setResult] = useState(null)

  // For crypto, we need to convert account currency to the quote currency (e.g., USDC)
  // For equities, we convert account currency to asset currency (e.g., USD)
  const getTargetCurrency = () => {
    if (assetType === 'crypto') {
      return toFiatCurrency(quoteCurrency)
    }
    return assetCurrency
  }

  const targetCurrency = getTargetCurrency()
  const accountCurrencyFiat = toFiatCurrency(accountCurrency)
  const needsConversion = accountCurrencyFiat !== targetCurrency

  const fetchExchangeRate = async (fromCurrency, toCurrency) => {
    if (fromCurrency === toCurrency) {
      setExchangeRate('1')
      setRateLastUpdated(null)
      return
    }

    setRateLoading(true)
    setRateError(null)

    try {
      const response = await fetch(
        `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch rate')
      }

      const data = await response.json()
      const rate = data.rates[toCurrency]

      if (rate) {
        setExchangeRate(rate.toString())
        setRateLastUpdated(new Date())
      } else {
        throw new Error('Rate not found')
      }
    } catch (err) {
      setRateError('Could not fetch rate')
      console.error('Exchange rate fetch error:', err)
    } finally {
      setRateLoading(false)
    }
  }

  // Fetch crypto price from CoinGecko
  const fetchCryptoPrice = async () => {
    const symbol = cryptoSymbol.toUpperCase()
    const coinId = CRYPTO_IDS[symbol] || symbol.toLowerCase()

    setPriceLoading(true)
    setPriceError(null)

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
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

  // Fetch stock price from Yahoo Finance via CORS proxy
  const fetchStockPrice = async () => {
    if (!stockTicker) {
      setPriceError('Enter a ticker symbol')
      return
    }

    setPriceLoading(true)
    setPriceError(null)

    try {
      // Using Yahoo Finance chart API via CORS proxy
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${stockTicker.toUpperCase()}?interval=1d&range=1d`
      const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`)

      if (!response.ok) {
        throw new Error('Failed to fetch price')
      }

      const data = await response.json()
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

  const fetchPrice = () => {
    if (assetType === 'crypto') {
      fetchCryptoPrice()
    } else {
      fetchStockPrice()
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
  }, [cryptoSymbol, stockTicker, assetType])

  const calculatePositionSize = () => {
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

    // Risk amount in account currency
    const riskAmountAccount = equityVal * (riskVal / 100)

    // Convert risk amount to target currency if needed
    const effectiveRate = needsConversion ? rateVal : 1
    const riskAmountTarget = riskAmountAccount * effectiveRate

    const riskPerUnit = Math.abs(entryVal - stopVal)
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
  }

  useEffect(() => {
    calculatePositionSize()
  }, [cryptoEquity, equityEquity, cryptoRiskPercent, equityRiskPercent, cryptoEntryPrice, cryptoStopPrice, cryptoTargetPrice, equityEntryPrice, equityStopPrice, equityTargetPrice, cryptoAccountCurrency, equityAccountCurrency, assetCurrency, quoteCurrency, exchangeRate, assetType, tradeDirection])

  const formatNumber = (num, decimals = 2) => {
    if (assetType === 'crypto') {
      return num.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: 8
      })
    }
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }

  const formatTime = (date) => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getDisplayQuoteCurrency = () => {
    return assetType === 'crypto' ? quoteCurrency : assetCurrency
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

      <main className="calculator">
        <div className="toggle-group">
          <div className="toggle-section">
            <label>Asset Type</label>
            <div className="toggle-buttons">
              <button
                className={assetType === 'crypto' ? 'active' : ''}
                onClick={() => setAssetType('crypto')}
              >
                Crypto
              </button>
              <button
                className={assetType === 'equity' ? 'active' : ''}
                onClick={() => setAssetType('equity')}
              >
                Equity
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
              {(assetType === 'crypto' ? CRYPTO_ACCOUNT_CURRENCIES : FIAT_CURRENCIES).map(c => (
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
        </div>

        {assetType === 'crypto' ? (
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
        ) : (
          <div className="input-group">
            <label htmlFor="stockTicker">Stock Ticker</label>
            <input
              id="stockTicker"
              type="text"
              placeholder="e.g. AAPL, TSLA, IBIT"
              value={stockTicker}
              onChange={(e) => setStockTicker(e.target.value.toUpperCase())}
            />
          </div>
        )}

        <div className="input-group">
          <div className="price-header">
            <label htmlFor="entry">
              Entry Price {assetType === 'crypto' ? `(${quoteCurrency})` : assetCurrency ? `(${assetCurrency})` : ''}
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
                  Fetch ({assetType === 'crypto' ? 'CoinGecko' : 'Yahoo'})
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
              onChange={(e) => setEntryPrice(e.target.value)}
              min="0"
              step="any"
              className="flex-grow"
            />
            {assetType === 'equity' && (
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
          {priceError && <span className="price-error">{priceError}</span>}
        </div>

        <div className="input-group">
          <label htmlFor="stop">
            Stop Loss Price ({getDisplayQuoteCurrency()})
          </label>
          <input
            id="stop"
            type="number"
            placeholder={tradeDirection === 'long' ? 'e.g. 85000 (below entry)' : 'e.g. 92000 (above entry)'}
            value={stopPrice}
            onChange={(e) => setStopPrice(e.target.value)}
            min="0"
            step="any"
          />
        </div>

        <div className="input-group">
          <label htmlFor="target">
            Target Price ({getDisplayQuoteCurrency()}) <span className="optional-label">optional</span>
          </label>
          <input
            id="target"
            type="number"
            placeholder={tradeDirection === 'long' ? 'e.g. 95000 (above entry)' : 'e.g. 80000 (below entry)'}
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            min="0"
            step="any"
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
                    // Round to 2 decimals for equity, 8 for crypto
                    const decimals = assetType === 'crypto' ? 8 : 2
                    target = Math.round(target * Math.pow(10, decimals)) / Math.pow(10, decimals)
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
                      {formatNumber(result.positionSize, 8)} {cryptoSymbol || 'units'}
                    </span>
                  </div>
                  <div className="result-item highlight-secondary">
                    <span className="result-label">Size in {quoteCurrency}</span>
                    <span className="result-value">
                      {formatNumber(result.positionValue, 2)} {quoteCurrency}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="result-item highlight">
                    <span className="result-label">Position Size</span>
                    <span className="result-value">
                      {formatNumber(result.positionSize, 0)} shares
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
                      ({getDisplayQuoteCurrency()} {formatNumber(result.riskAmountTarget)})
                    </span>
                  )}
                </span>
              </div>
              <div className="result-item">
                <span className="result-label">Risk per {assetType === 'crypto' ? cryptoSymbol || 'Unit' : 'Share'}</span>
                <span className="result-value">{getDisplayQuoteCurrency()} {formatNumber(result.riskPerUnit, assetType === 'crypto' ? 2 : 2)}</span>
              </div>
              {result.profitAmount !== null && (
                <>
                  <div className="result-item profit">
                    <span className="result-label">Potential Profit</span>
                    <span className="result-value profit-value">
                      +{accountCurrency} {formatNumber(needsConversion ? result.profitAmountAccount : result.profitAmount)}
                      {needsConversion && (
                        <span className="converted-value">
                          ({getDisplayQuoteCurrency()} {formatNumber(result.profitAmount)})
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
          <code>Size = (Equity × Risk% × Rate) / |Entry - Stop|</code>
        </div>
      </main>

      <footer className="footer">
        <p>Works offline - Install as app for best experience</p>
      </footer>
    </div>
  )
}

export default App
