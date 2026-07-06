/**
 * Local portfolio snapshot contract for the heatmap dashboard.
 *
 * This intentionally mirrors the shape we expect from a later shared trading
 * API, so the dashboard can move from fixture data to live adapters without
 * rewriting the visual component.
 */

export const samplePortfolioSnapshot = {
  id: 'ibkr-screenshot-sample',
  currency: 'USD',
  asOf: '2026-06-08T09:15:00.000Z',
  accounts: [
    {
      id: 'u18651415',
      label: 'U18651415',
      source: 'Interactive Brokers',
      baseCurrency: 'USD',
      netLiquidity: 161000,
      cash: 100000,
      availableFunds: 105500,
      buyingPower: 73500,
      dailyPnl: 424.76,
      unrealizedPnl: -2179.14,
      realizedPnl: 4462.82,
      excessLiquidity: 112800,
      maintenanceMargin: 48200,
      initialMargin: 55400,
      cashBreakdown: [
        { currency: 'AUD', marketValue: 65457 },
        { currency: 'USD', marketValue: 34591 },
      ],
    },
  ],
  positions: [
    {
      id: 'u18651415-bmnr',
      source: 'Interactive Brokers',
      accountId: 'u18651415',
      accountLabel: 'U18651415',
      assetClass: 'Equities',
      symbol: 'BMNR',
      description: 'BITMINE IMMERSION TECHNOLOGIES',
      side: 'short',
      quantity: 200,
      signedQuantity: -200,
      averagePrice: 17.015,
      currentPrice: 16.68,
      marketValue: -4718,
      costBasis: -4813,
      dailyPnl: -221,
      pnl: 95,
      pnlPercent: 2.0,
      change: 0.78,
      feeRatePercent: 0.27,
      grossMarginPercent: 64.4,
      currency: 'USD',
    },
    {
      id: 'u18651415-pltr',
      source: 'Interactive Brokers',
      accountId: 'u18651415',
      accountLabel: 'U18651415',
      assetClass: 'Equities',
      symbol: 'PLTR',
      description: 'PALANTIR TECHNOLOGIES INC-A',
      side: 'short',
      quantity: 30,
      signedQuantity: -30,
      averagePrice: 141.359,
      currentPrice: 136.58,
      marketValue: -5795,
      costBasis: -5998,
      dailyPnl: -45,
      pnl: 203,
      pnlPercent: 3.4,
      change: 1.05,
      feeRatePercent: 0.41,
      grossMarginPercent: 84.1,
      currency: 'USD',
    },
    {
      id: 'u18651415-sata',
      source: 'Interactive Brokers',
      accountId: 'u18651415',
      accountLabel: 'U18651415',
      assetClass: 'Preferred Equity',
      symbol: 'SATA',
      description: 'STRIVE INC PERP PFD SER A VAR',
      side: 'long',
      quantity: 650,
      signedQuantity: 650,
      averagePrice: 99.605,
      currentPrice: 95.5,
      marketValue: 87790,
      costBasis: 91563,
      dailyPnl: 1057,
      pnl: -3773,
      pnlPercent: -4.1,
      change: 1.15,
      feeRatePercent: 3.15,
      currency: 'USD',
    },
    {
      id: 'u18651415-silj',
      source: 'Interactive Brokers',
      accountId: 'u18651415',
      accountLabel: 'U18651415',
      assetClass: 'Precious Metals',
      symbol: 'SILJ',
      description: 'AMPLIFY JUNIOR SILVER MINERS',
      side: 'short',
      quantity: 200,
      signedQuantity: -200,
      averagePrice: 29.422,
      currentPrice: 26.75,
      marketValue: -7567,
      costBasis: -8322,
      dailyPnl: -111,
      pnl: 755,
      pnlPercent: 9.1,
      change: 0.39,
      feeRatePercent: 0.4,
      currency: 'USD',
    },
    {
      id: 'u18651415-slv',
      source: 'Interactive Brokers',
      accountId: 'u18651415',
      accountLabel: 'U18651415',
      assetClass: 'Precious Metals',
      symbol: 'SLV',
      description: 'ISHARES SILVER TRUST',
      side: 'short',
      quantity: 100,
      signedQuantity: -100,
      averagePrice: 65.698,
      currentPrice: 61.87,
      marketValue: -8750,
      costBasis: -9291,
      dailyPnl: -42,
      pnl: 541,
      pnlPercent: 5.8,
      change: 0.3,
      feeRatePercent: 0.39,
      currency: 'USD',
    },
    {
      id: 'u18651415-base-cash',
      source: 'Interactive Brokers',
      accountId: 'u18651415',
      accountLabel: 'U18651415',
      assetClass: 'Cash',
      symbol: 'BASE CASH',
      description: 'Base currency cash balance',
      kind: 'cash',
      side: 'cash',
      quantity: 100048,
      currentPrice: 1,
      marketValue: 100048,
      pnl: 0,
      pnlPercent: 0,
      currency: 'USD',
    },
  ],
}

export const calculatePortfolioStats = (snapshot) => {
  const positions = snapshot.positions ?? []

  return positions.reduce(
    (stats, position) => {
      const marketValue = Number(position.marketValue) || 0
      const exposure = Math.abs(marketValue)

      stats.grossExposure += exposure
      stats.netExposure += marketValue
      stats.pnl += Number(position.pnl) || 0
      if (position.kind !== 'cash') {
        stats.positionCount += 1
      }
      stats.sources.add(position.source)
      stats.assetClasses.add(position.assetClass)

      if (marketValue >= 0) {
        stats.longExposure += exposure
      } else {
        stats.shortExposure += exposure
      }

      return stats
    },
    {
      grossExposure: 0,
      longExposure: 0,
      shortExposure: 0,
      netExposure: 0,
      pnl: 0,
      positionCount: 0,
      sources: new Set(),
      assetClasses: new Set(),
    },
  )
}
