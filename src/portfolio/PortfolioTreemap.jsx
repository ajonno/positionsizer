import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts/core'
import { TreemapChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { calculatePortfolioStats, samplePortfolioSnapshot } from './samplePortfolioSnapshot'

echarts.use([TreemapChart, TooltipComponent, CanvasRenderer])

const SIDE_COLORS = {
  long: '#22c55e',
  short: '#f43f5e',
  cash: '#818cf8',
  neutral: '#818cf8',
}

const ASSET_CLASS_COLORS = {
  'Crypto Perps': '#0e7490',
  Equities: '#2563eb',
  'Preferred Equity': '#0891b2',
  ETFs: '#7c3aed',
  'Precious Metals': '#ca8a04',
  Futures: '#d97706',
  Options: '#be123c',
  'Fixed Income': '#64748b',
  Cash: '#4f46e5',
}

const formatCurrency = (value, currency = 'USD', options = {}) => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  }).format(value)
}

const formatNumber = (value, maximumFractionDigits = 2) => {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(value)
}

const escapeHtml = (value) => {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const getSideColor = (side) => {
  return SIDE_COLORS[String(side).toLowerCase()] ?? SIDE_COLORS.neutral
}

const getPositionLabel = (position) => {
  const exposure = Math.abs(Number(position.marketValue) || 0)

  if (position.kind === 'cash') {
    return `${position.symbol}\n${formatCurrency(exposure, position.currency)}`
  }

  return `${position.symbol}\n${formatCurrency(exposure, position.currency)}`
}

const createPositionNode = (position) => {
  const exposure = Math.abs(Number(position.marketValue) || 0)

  return {
    id: position.id,
    name: position.symbol,
    value: exposure,
    position,
    itemStyle: {
      color: getSideColor(position.side),
      borderColor: 'rgba(255, 255, 255, 0.12)',
      borderWidth: 1,
    },
    label: {
      formatter: getPositionLabel(position),
    },
  }
}

const groupPositionsForTreemap = (positions) => {
  const assetClassGroups = new Map()

  for (const position of positions) {
    const assetClass = position.assetClass || 'Other'
    const accountKey = position.accountId || `${position.source}:unknown`

    if (!assetClassGroups.has(assetClass)) {
      assetClassGroups.set(assetClass, new Map())
    }

    const accountGroups = assetClassGroups.get(assetClass)

    if (!accountGroups.has(accountKey)) {
      accountGroups.set(accountKey, {
        accountLabel: position.accountLabel || accountKey,
        source: position.source,
        positions: [],
      })
    }

    accountGroups.get(accountKey).positions.push(position)
  }

  return Array.from(assetClassGroups.entries()).map(([assetClass, accountGroups]) => {
    const children = Array.from(accountGroups.values()).map((accountGroup) => {
      const accountChildren = accountGroup.positions.map(createPositionNode)
      const accountExposure = accountChildren.reduce((sum, child) => sum + child.value, 0)

      return {
        name: accountGroup.accountLabel,
        value: accountExposure,
        children: accountChildren,
        itemStyle: {
          color: 'rgba(15, 52, 96, 0.82)',
        },
      }
    })
    const assetExposure = children.reduce((sum, child) => sum + child.value, 0)

    return {
      name: assetClass,
      value: assetExposure,
      children,
      itemStyle: {
        color: ASSET_CLASS_COLORS[assetClass] ?? '#475569',
      },
    }
  })
}

const buildTreemapOption = (snapshot) => {
  const currency = snapshot.currency ?? 'USD'
  const data = groupPositionsForTreemap(snapshot.positions ?? [])

  return {
    backgroundColor: 'transparent',
    tooltip: {
      confine: true,
      backgroundColor: '#111827',
      borderColor: 'rgba(255, 255, 255, 0.14)',
      borderWidth: 1,
      padding: 12,
      textStyle: {
        color: '#f9fafb',
        fontSize: 12,
      },
      formatter: (params) => {
        const { data: item } = params
        const position = item?.position

        if (!position) {
          return `
            <strong>${escapeHtml(params.name)}</strong><br />
            Gross exposure: ${formatCurrency(Number(params.value) || 0, currency)}
          `
        }

        const signedExposure = Number(position.marketValue) || 0
        const side = String(position.side || '').toUpperCase()
        const pnl = Number(position.pnl) || 0
        const pnlPercent = Number(position.pnlPercent) || 0

        if (position.kind === 'cash') {
          return `
            <strong>${escapeHtml(position.symbol)}</strong><br />
            ${escapeHtml(position.description)}<br />
            ${escapeHtml(position.accountLabel)}<br />
            Balance: ${formatCurrency(signedExposure, position.currency)}
          `
        }

        return `
          <strong>${escapeHtml(position.symbol)}</strong><br />
          ${escapeHtml(position.description)}<br />
          ${escapeHtml(position.accountLabel)}<br />
          ${side} ${formatNumber(position.quantity)} @ ${formatCurrency(position.currentPrice, position.currency, { maximumFractionDigits: 2 })}<br />
          Exposure: ${formatCurrency(signedExposure, position.currency)}<br />
          PnL: ${formatCurrency(pnl, position.currency)} (${pnlPercent.toFixed(2)}%)
        `
      },
    },
    series: [
      {
        type: 'treemap',
        name: 'Portfolio Exposure',
        data,
        roam: false,
        nodeClick: 'zoomToNode',
        visibleMin: 200,
        top: 30,
        right: 0,
        bottom: 0,
        left: 0,
        breadcrumb: {
          show: true,
          top: 0,
          height: 24,
          emptyItemWidth: 0,
          itemStyle: {
            color: '#16213e',
            borderColor: '#2a2a4a',
            borderWidth: 1,
            textStyle: {
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 600,
            },
          },
        },
        label: {
          show: true,
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 17,
          overflow: 'break',
        },
        upperLabel: {
          show: true,
          height: 26,
          color: '#ffffff',
          fontSize: 11,
          fontWeight: 700,
        },
        itemStyle: {
          borderColor: '#1a1a2e',
          borderWidth: 2,
          gapWidth: 3,
        },
        levels: [
          {
            itemStyle: {
              borderColor: '#1a1a2e',
              borderWidth: 0,
              gapWidth: 4,
            },
            upperLabel: {
              show: false,
            },
          },
          {
            itemStyle: {
              borderColor: '#1a1a2e',
              borderWidth: 3,
              gapWidth: 4,
            },
          },
          {
            itemStyle: {
              borderColor: '#16213e',
              borderWidth: 2,
              gapWidth: 3,
            },
          },
          {
            itemStyle: {
              borderColor: 'rgba(255, 255, 255, 0.12)',
              borderWidth: 1,
              gapWidth: 2,
            },
          },
        ],
      },
    ],
  }
}

function PortfolioTreemap({ snapshot = samplePortfolioSnapshot }) {
  const chartRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const stats = useMemo(() => calculatePortfolioStats(snapshot), [snapshot])
  const option = useMemo(() => buildTreemapOption(snapshot), [snapshot])

  useEffect(() => {
    if (!chartRef.current) {
      return undefined
    }

    const chart = echarts.init(chartRef.current, null, {
      renderer: 'canvas',
    })
    chartInstanceRef.current = chart
    chart.setOption(option)

    const resizeObserver = new ResizeObserver(() => {
      chart.resize()
    })
    resizeObserver.observe(chartRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.dispose()
      chartInstanceRef.current = null
    }
  }, [option])

  useEffect(() => {
    chartInstanceRef.current?.setOption(option, true)
  }, [option])

  return (
    <section className="treemap-section" aria-label="Portfolio exposure heatmap">
      <div className="portfolio-stats" aria-label="Portfolio exposure summary">
        <div className="portfolio-stat">
          <span>Gross Exposure</span>
          <strong>{formatCurrency(stats.grossExposure, snapshot.currency)}</strong>
        </div>
        <div className="portfolio-stat">
          <span>Net Exposure</span>
          <strong>{formatCurrency(stats.netExposure, snapshot.currency)}</strong>
        </div>
        <div className="portfolio-stat">
          <span>Open PnL</span>
          <strong className={stats.pnl >= 0 ? 'positive' : 'negative'}>
            {formatCurrency(stats.pnl, snapshot.currency)}
          </strong>
        </div>
        <div className="portfolio-stat">
          <span>Positions</span>
          <strong>{stats.positionCount}</strong>
        </div>
      </div>

      <div className="treemap-panel">
        <div className="treemap-header">
          <div>
            <h2>Portfolio Heatmap</h2>
            <p>
              {stats.sources.size} sources · {stats.assetClasses.size} asset classes
            </p>
          </div>
          <div className="heatmap-legend" aria-label="Heatmap color legend">
            <span><i className="legend-dot long"></i>Long</span>
            <span><i className="legend-dot short"></i>Short</span>
            <span><i className="legend-dot cash"></i>Cash</span>
          </div>
        </div>
        <div ref={chartRef} className="treemap-chart" role="img" aria-label="Treemap of portfolio gross exposure by asset class, account, and position" />
      </div>
    </section>
  )
}

export default PortfolioTreemap
