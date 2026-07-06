import { useCallback, useEffect, useMemo, useState } from 'react'
import PortfolioTreemap from './PortfolioTreemap'
import { loadPortfolioSnapshot } from './portfolioDataAdapter'
import { samplePortfolioSnapshot } from './samplePortfolioSnapshot'

const PORTFOLIO_FILTERS = [
  {
    id: 'hyperliquid',
    label: 'Hyperliquid',
    meta: 'Perps',
  },
  {
    id: 'ib-personal',
    label: 'IB Personal',
    meta: '1537187',
  },
  {
    id: 'ib-smsf',
    label: 'IB SMSF',
    meta: '1537184',
  },
]

const defaultActiveFilters = Object.fromEntries(PORTFOLIO_FILTERS.map((filter) => [filter.id, true]))

const formatStatusTime = (isoString) => {
  if (!isoString) {
    return 'Not refreshed yet'
  }

  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const positionFilterId = (position) => {
  if (position.portfolioId) {
    return position.portfolioId
  }

  if (position.source === 'Hyperliquid') {
    return 'hyperliquid'
  }

  if (position.source === 'Interactive Brokers') {
    const label = String(position.portfolioLabel || position.accountLabel || '').toLowerCase()

    if (label.includes('personal')) {
      return 'ib-personal'
    }

    return 'ib-smsf'
  }

  return 'unknown'
}

const filterSnapshot = (snapshot, activeFilters) => {
  const positions = (snapshot.positions ?? []).filter((position) => {
    const filterId = positionFilterId(position)
    return activeFilters[filterId] ?? true
  })
  const activeAccountIds = new Set(positions.map((position) => position.accountId))
  const accounts = (snapshot.accounts ?? []).filter((account) => activeAccountIds.has(account.id))

  return {
    ...snapshot,
    accounts,
    positions,
  }
}

const filterPositionCounts = (snapshot) => {
  return (snapshot.positions ?? []).reduce((counts, position) => {
    if (position.kind === 'cash') {
      return counts
    }

    const filterId = positionFilterId(position)
    counts[filterId] = (counts[filterId] ?? 0) + 1
    return counts
  }, {})
}

// Live account balance (equity) per portfolio filter. Prefers the broker-reported
// account value carried on snapshot.accounts; falls back to net market value.
const filterAccountBalances = (snapshot) => {
  const bucketByAccount = new Map()
  const netValueByAccount = new Map()

  for (const position of snapshot.positions ?? []) {
    const accountId = position.accountId

    if (!bucketByAccount.has(accountId)) {
      bucketByAccount.set(accountId, positionFilterId(position))
    }

    netValueByAccount.set(accountId, (netValueByAccount.get(accountId) ?? 0) + (Number(position.marketValue) || 0))
  }

  const balances = {}
  const counted = new Set()

  const addBalance = (bucket, amount, currency) => {
    if (!bucket) {
      return
    }

    if (!balances[bucket]) {
      balances[bucket] = { amount: 0, currency }
    }

    // Disjoint accounts (e.g. Hyperliquid master + subaccounts) sum into one bucket.
    balances[bucket].amount += Number(amount) || 0
  }

  // Drive from accounts so a flat account (equity but no open positions) still shows.
  for (const account of snapshot.accounts ?? []) {
    const bucket = bucketByAccount.get(account.id) ?? account.portfolioId
    const equity = account.equity ?? account.netLiquidity ?? netValueByAccount.get(account.id) ?? 0
    const currency = account.baseCurrency ?? account.currency ?? snapshot.currency ?? 'USD'

    addBalance(bucket, equity, currency)
    counted.add(account.id)
  }

  // Fallback for positions whose account is absent from snapshot.accounts.
  for (const [accountId, bucket] of bucketByAccount) {
    if (counted.has(accountId)) {
      continue
    }

    addBalance(bucket, netValueByAccount.get(accountId) ?? 0, snapshot.currency ?? 'USD')
  }

  return balances
}

const formatAccountBalance = (amount, currency) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`
  }
}

function PortfolioDashboard() {
  const [snapshot, setSnapshot] = useState(samplePortfolioSnapshot)
  const [status, setStatus] = useState({
    mode: 'sample',
    message: 'Using sample data while the trading API loads.',
    refreshedAt: null,
    sources: [],
  })
  const [loading, setLoading] = useState(false)
  const [activeFilters, setActiveFilters] = useState(defaultActiveFilters)
  const visibleSnapshot = useMemo(() => filterSnapshot(snapshot, activeFilters), [snapshot, activeFilters])
  const filterCounts = useMemo(() => filterPositionCounts(snapshot), [snapshot])
  const filterBalances = useMemo(() => filterAccountBalances(snapshot), [snapshot])

  const toggleFilter = (filterId) => {
    setActiveFilters((current) => ({
      ...current,
      [filterId]: !current[filterId],
    }))
  }

  const refreshSnapshot = useCallback(async () => {
    setLoading(true)

    try {
      const result = await loadPortfolioSnapshot()
      setSnapshot(result.snapshot)
      setStatus(result.status)
    } catch (error) {
      setSnapshot(samplePortfolioSnapshot)
      setStatus({
        mode: 'sample',
        message: error instanceof Error ? error.message : 'Could not load portfolio data.',
        refreshedAt: new Date().toISOString(),
        sources: [],
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSnapshot()
  }, [refreshSnapshot])

  return (
    <div className="portfolio-dashboard-stack">
      <div className="data-source-bar">
        <div>
          <span className={`source-status ${status.mode}`}>{status.mode}</span>
          <strong>{status.message}</strong>
          <p>Last refreshed {formatStatusTime(status.refreshedAt)}</p>
        </div>
        <button className="dashboard-refresh-btn" type="button" onClick={refreshSnapshot} disabled={loading}>
          {loading ? (
            <span className="spinner"></span>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {status.sources.length > 0 && (
        <div className="source-health-grid" aria-label="Broker data source health">
          {status.sources.map((source) => (
            <div key={source.label} className={`source-health ${source.ok ? 'ok' : 'error'}`}>
              <span>{source.label}</span>
              <strong>{source.ok ? `${source.count} positions` : 'Unavailable'}</strong>
            </div>
          ))}
        </div>
      )}

      <fieldset className="portfolio-filter-bar" aria-label="Portfolio filters">
        <legend>Show Portfolios</legend>
        <div className="portfolio-filter-options">
          {PORTFOLIO_FILTERS.map((filter) => {
            const count = filterCounts[filter.id] ?? 0
            const balance = filterBalances[filter.id]

            return (
              <label key={filter.id} className={`portfolio-filter-option ${activeFilters[filter.id] ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={activeFilters[filter.id]}
                  onChange={() => toggleFilter(filter.id)}
                />
                <span className="portfolio-filter-checkbox" aria-hidden="true"></span>
                <span>
                  <span className="portfolio-filter-heading">
                    <strong>{filter.label}</strong>
                    {balance && (
                      <span className="portfolio-filter-balance">
                        · bal {formatAccountBalance(balance.amount, balance.currency)}
                      </span>
                    )}
                  </span>
                  <small>{filter.meta} · {count} positions</small>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <PortfolioTreemap snapshot={visibleSnapshot} />
    </div>
  )
}

export default PortfolioDashboard
