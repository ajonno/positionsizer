import http from 'node:http'
import { XMLParser } from 'fast-xml-parser'
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: '.env.local', quiet: true })
loadDotenv({ path: '.env', quiet: true })

const HOST = process.env.PORTFOLIO_BRIDGE_HOST || '127.0.0.1'
const PORT = Number(process.env.PORTFOLIO_BRIDGE_PORT || 5174)
const HYPERLIQUID_INFO_URL = process.env.HYPERLIQUID_INFO_URL || 'https://api.hyperliquid.xyz/info'
const IBKR_BASE_URL = (process.env.IBKR_CLIENT_PORTAL_BASE_URL || 'http://localhost:5003/v1/api').replace(/\/$/, '')
const IBKR_SOURCE_MODE = (process.env.IBKR_SOURCE_MODE || 'flex').trim().toLowerCase()
const IBKR_FLEX_BASE_URL = (process.env.IBKR_FLEX_BASE_URL || 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService').replace(/\/$/, '')
const IBKR_FLEX_TOKEN = (process.env.IBKR_FLEX_TOKEN || process.env.IB_FLEX_TOKEN || '').trim()
const IBKR_FLEX_QUERY_ID = (process.env.IBKR_FLEX_QUERY_ID || process.env.IB_FLEX_QUERY_ID || '').trim()
const IBKR_FLEX_VERSION = process.env.IBKR_FLEX_VERSION || '3'
const IBKR_FLEX_BASE_CURRENCY = (process.env.IBKR_FLEX_BASE_CURRENCY || '').trim().toUpperCase()
const IBKR_FLEX_POLL_DELAY_MS = Number(process.env.IBKR_FLEX_POLL_DELAY_MS || 5000)
const IBKR_FLEX_MAX_ATTEMPTS = Number(process.env.IBKR_FLEX_MAX_ATTEMPTS || 6)
const IBKR_FLEX_CONVERT_TO_BASE = process.env.IBKR_FLEX_CONVERT_TO_BASE !== 'false'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

const ETF_SYMBOLS = new Set(['IBIT', 'SILJ', 'SLV', 'SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD'])
const FUTURES_SYMBOLS = new Set(['ES', 'MES', 'NQ', 'MNQ', 'YM', 'MYM', 'RTY', 'M2K', 'GC', 'MGC', 'SI', 'SIL'])
const PRECIOUS_METALS_SYMBOLS = new Set(['GLD', 'IAU', 'SLV', 'SIL', 'SILJ', 'GDX', 'GDXJ'])
const IBKR_FLEX_RETRYABLE_ERROR_CODES = new Set(['1001', '1004', '1005', '1006', '1007', '1008', '1009', '1018', '1019', '1021'])

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
})

const jsonResponse = (res, status, payload) => {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(payload))
}

const readOnlyWalletAddress = () => {
  return (
    process.env.PORTFOLIO_HYPERLIQUID_MASTER_ADDRESS ||
    process.env.PORTFOLIO_HYPERLIQUID_WALLET_ADDRESS ||
    process.env.HYPERLIQUID_WALLET_ADDRESS ||
    process.env.HYPERLIQUID_MASTER_ADDRESS ||
    process.env.HL_MASTER_ADDRESS ||
    process.env.HL_SUBACCOUNT_ADDRESS ||
    ''
  ).trim().toLowerCase()
}

const asNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const asArray = (value) => {
  if (value === null || value === undefined) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

const readField = (object, ...fieldNames) => {
  if (!object || typeof object !== 'object') {
    return ''
  }

  for (const fieldName of fieldNames) {
    const value = object[fieldName]

    if (value !== null && value !== undefined && value !== '') {
      return value
    }
  }

  const entries = Object.entries(object)

  for (const fieldName of fieldNames) {
    const normalizedName = fieldName.toLowerCase()
    const match = entries.find(([key, value]) => key.toLowerCase() === normalizedName && value !== null && value !== undefined && value !== '')

    if (match) {
      return match[1]
    }
  }

  return ''
}

const readString = (object, ...fieldNames) => String(readField(object, ...fieldNames) || '')
const readNumber = (object, fallback, ...fieldNames) => asNumber(readField(object, ...fieldNames), fallback)

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const displaySourceStatus = (label, status, count = 0, error = null) => ({
  label,
  ok: status === 'ok',
  count,
  ...(error ? { error } : {}),
})

const postHyperliquidInfo = async (body) => {
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Hyperliquid info request failed (${response.status})`)
  }

  return response.json()
}

const hyperliquidPositionRows = (state, mids, account) => {
  const assetPositions = Array.isArray(state?.assetPositions) ? state.assetPositions : []

  return assetPositions
    .map((item) => item?.position)
    .filter(Boolean)
    .map((position) => {
      const signedSize = asNumber(position.szi)

      if (!signedSize) {
        return null
      }

      const symbol = String(position.coin || '').toUpperCase()
      const currentPrice = asNumber(mids[symbol], asNumber(position.entryPx))
      const positionValue = asNumber(position.positionValue, Math.abs(signedSize) * currentPrice)
      const side = signedSize < 0 ? 'short' : 'long'

      return {
        id: `hyperliquid:${account.address}:${symbol}:${side}`,
        source: 'Hyperliquid',
        portfolioId: 'hyperliquid',
        portfolioLabel: 'Hyperliquid',
        accountId: `hyperliquid:${account.address}`,
        accountLabel: account.label,
        assetClass: 'Crypto Perps',
        symbol,
        description: `${symbol} perp`,
        side,
        quantity: Math.abs(signedSize),
        signedQuantity: signedSize,
        averagePrice: asNumber(position.entryPx),
        currentPrice,
        marketValue: side === 'short' ? -Math.abs(positionValue) : Math.abs(positionValue),
        pnl: asNumber(position.unrealizedPnl),
        pnlPercent: asNumber(position.returnOnEquity) * 100,
        accountEquity: account.equity,
        currency: 'USD',
      }
    })
    .filter(Boolean)
}

const hyperliquidAccountLabel = (prefix, address) => {
  return `${prefix} ${address.slice(0, 6)}...${address.slice(-4)}`
}

const fetchHyperliquidPositions = async () => {
  const masterWallet = readOnlyWalletAddress()

  if (!masterWallet) {
    throw new Error('Hyperliquid wallet address is not configured')
  }

  const [masterState, mids, subAccountsResult] = await Promise.allSettled([
    postHyperliquidInfo({ type: 'clearinghouseState', user: masterWallet }),
    postHyperliquidInfo({ type: 'allMids' }),
    postHyperliquidInfo({ type: 'subAccounts', user: masterWallet }),
  ])

  if (masterState.status === 'rejected') {
    throw masterState.reason
  }

  if (mids.status === 'rejected') {
    throw mids.reason
  }

  // null (not 0) when the field is absent, so a missing/empty clearinghouseState
  // falls back to net market value instead of being pinned to a reported 0.
  const accountValueOf = (state) => {
    const raw = state?.marginSummary?.accountValue
    return raw === undefined || raw === null || raw === '' ? null : asNumber(raw)
  }

  const accounts = [
    {
      address: masterWallet,
      label: hyperliquidAccountLabel('Hyperliquid Master', masterWallet),
      state: masterState.value,
      equity: accountValueOf(masterState.value),
    },
  ]

  if (subAccountsResult.status === 'fulfilled' && Array.isArray(subAccountsResult.value)) {
    for (const item of subAccountsResult.value) {
      const address = String(item?.subAccountUser || '').toLowerCase()

      if (!address) {
        continue
      }

      accounts.push({
        address,
        label: item?.name ? `Hyperliquid ${item.name}` : hyperliquidAccountLabel('Hyperliquid Subaccount', address),
        state: item?.clearinghouseState || {},
        equity: accountValueOf(item?.clearinghouseState),
      })
    }
  }

  // Emit account descriptors independently of positions so that a flat account
  // (collateral but no open perps) still surfaces its balance. Master and each
  // subaccount are disjoint collateral pools, so summing them per portfolio later
  // does not double-count.
  const accountDescriptors = accounts.map((account) => ({
    id: `hyperliquid:${account.address}`,
    label: account.label,
    source: 'Hyperliquid',
    portfolioId: 'hyperliquid',
    baseCurrency: 'USD',
    equity: account.equity,
  }))

  return {
    positions: accounts.flatMap((account) => hyperliquidPositionRows(account.state, mids.value, account)),
    accounts: accountDescriptors,
  }
}

const ibkrFetchJson = async (path) => {
  const response = await fetch(`${IBKR_BASE_URL}${path}`, {
    headers: {
      accept: 'application/json',
      'user-agent': 'positionsizer-portfolio-bridge',
    },
  })

  if (!response.ok) {
    throw new Error(`IBKR Client Portal request failed (${response.status})`)
  }

  return response.json()
}

const inferIbkrAssetClass = (position) => {
  const assetCategory = readString(position, 'assetCategory', 'assetClass', 'type').toUpperCase()
  const symbol = readString(position, 'ticker', 'symbol', 'contractDesc').toUpperCase()
  const description = readString(position, 'fullName', 'description', 'contractDesc').toUpperCase()

  if (assetCategory === 'FUT') {
    return 'Futures'
  }

  if (assetCategory === 'OPT' || assetCategory === 'FOP') {
    return 'Options'
  }

  if (assetCategory === 'CASH') {
    return 'Cash'
  }

  if (assetCategory === 'BOND') {
    return 'Fixed Income'
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

const fetchIbkrClientPortalPositions = async () => {
  const accounts = await ibkrFetchJson('/portfolio/accounts')

  if (!Array.isArray(accounts) || accounts.length === 0) {
    return []
  }

  const positionChunks = await Promise.all(accounts.map(async (account) => {
    const accountId = account.accountId || account.id

    if (!accountId) {
      return []
    }

    const positions = await ibkrFetchJson(`/portfolio/${encodeURIComponent(accountId)}/positions/0`)
    return Array.isArray(positions)
      ? positions.map((position) => ({ account, position }))
      : []
  }))

  return positionChunks.flat().map(({ account, position }) => {
    const signedQuantity = asNumber(position.position)
    const symbol = String(position.ticker || position.contractDesc || 'UNKNOWN').toUpperCase()
    const currentPrice = asNumber(position.mktPrice, position.last)
    const explicitMarketValue = asNumber(position.mktValue, asNumber(position.marketValue, null))
    const marketValue = explicitMarketValue ?? signedQuantity * currentPrice
    const side = signedQuantity < 0 || marketValue < 0 ? 'short' : 'long'
    const accountId = position.acctId || position.accountId || 'ibkr-primary'

    if (!signedQuantity && !marketValue) {
      return null
    }

    return {
      id: `ibkr:${accountId}:${position.conid || symbol}`,
      source: 'Interactive Brokers',
      accountId,
      accountLabel: account.accountAlias || account.accountId || account.id || accountId,
      assetClass: inferIbkrAssetClass(position),
      symbol,
      description: position.fullName || position.contractDesc || symbol,
      side,
      quantity: Math.abs(signedQuantity),
      signedQuantity,
      averagePrice: asNumber(position.avgPrice, asNumber(position.avgCost)),
      currentPrice,
      marketValue,
      pnl: asNumber(position.unrealizedPnl),
      pnlPercent: marketValue ? (asNumber(position.unrealizedPnl) / Math.abs(marketValue)) * 100 : 0,
      currency: position.currency || account.currency || 'USD',
    }
  }).filter(Boolean)
}

const splitList = (value) => {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const ibkrFlexConfigs = () => {
  const configs = []
  const addConfig = (config) => {
    if (!config.queryId) {
      return
    }

    if (!config.token) {
      throw new Error(`IBKR Flex token is not configured for query ${config.queryId}`)
    }

    const key = `${config.token}:${config.queryId}`

    if (configs.some((existing) => `${existing.token}:${existing.queryId}` === key)) {
      return
    }

    configs.push(config)
  }

  const sharedQueryIds = [
    ...splitList(process.env.IBKR_FLEX_QUERY_IDS),
    ...splitList(IBKR_FLEX_QUERY_ID),
  ]

  for (const queryId of sharedQueryIds) {
    addConfig({
      token: IBKR_FLEX_TOKEN,
      queryId,
      portfolioId: 'ibkr-flex',
      label: process.env.IBKR_FLEX_LABEL || `Flex Query ${queryId}`,
      baseCurrency: IBKR_FLEX_BASE_CURRENCY,
    })
  }

  for (let index = 1; index <= 10; index += 1) {
    const prefix = `IBKR_FLEX_ACCOUNT_${index}`
    const token = (process.env[`${prefix}_TOKEN`] || IBKR_FLEX_TOKEN).trim()
    const label = (process.env[`${prefix}_LABEL`] || `IBKR Account ${index}`).trim()
    const portfolioId = (process.env[`${prefix}_FILTER_ID`] || `ibkr-account-${index}`).trim()
    const baseCurrency = (process.env[`${prefix}_BASE_CURRENCY`] || IBKR_FLEX_BASE_CURRENCY).trim().toUpperCase()
    const queryIds = [
      ...splitList(process.env[`${prefix}_QUERY_IDS`]),
      ...splitList(process.env[`${prefix}_QUERY_ID`]),
    ]

    for (const queryId of queryIds) {
      addConfig({
        token,
        queryId,
        portfolioId,
        label,
        baseCurrency,
      })
    }
  }

  if (configs.length === 0) {
    throw new Error('IBKR Flex is not configured. Set IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID, or indexed IBKR_FLEX_ACCOUNT_1_* variables.')
  }

  return configs
}

const ibkrFlexFetchText = async (path, params) => {
  const url = new URL(`${IBKR_FLEX_BASE_URL}${path}`)

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url, {
    headers: {
      accept: 'application/xml, text/xml, */*',
      'user-agent': 'Java',
    },
  })
  const body = await response.text()

  if (!response.ok) {
    throw new Error(`IBKR Flex request failed (${response.status})`)
  }

  return body
}

const parseIbkrFlexXml = (xml) => {
  try {
    return xmlParser.parse(xml)
  } catch (error) {
    throw new Error(`IBKR Flex returned invalid XML: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const ibkrFlexResponseStatus = (parsed) => {
  const response = parsed?.FlexStatementResponse

  if (!response) {
    return null
  }

  return {
    status: readString(response, 'Status'),
    referenceCode: readString(response, 'ReferenceCode'),
    errorCode: readString(response, 'ErrorCode'),
    errorMessage: readString(response, 'ErrorMessage'),
  }
}

const ibkrFlexErrorMessage = (status) => {
  if (!status) {
    return 'Unexpected IBKR Flex response.'
  }

  const message = status.errorMessage || `IBKR Flex returned ${status.status || 'an error'}`
  return status.errorCode ? `IBKR Flex error ${status.errorCode}: ${message}` : message
}

const requestIbkrFlexStatement = async (config) => {
  const xml = await ibkrFlexFetchText('/SendRequest', {
    t: config.token,
    q: config.queryId,
    v: IBKR_FLEX_VERSION,
  })
  const parsed = parseIbkrFlexXml(xml)
  const status = ibkrFlexResponseStatus(parsed)

  if (status?.status !== 'Success' || !status.referenceCode) {
    throw new Error(ibkrFlexErrorMessage(status))
  }

  return status.referenceCode
}

const retrieveIbkrFlexStatement = async (config, referenceCode) => {
  let lastError = null

  for (let attempt = 1; attempt <= IBKR_FLEX_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await delay(IBKR_FLEX_POLL_DELAY_MS)
    }

    const xml = await ibkrFlexFetchText('/GetStatement', {
      t: config.token,
      q: referenceCode,
      v: IBKR_FLEX_VERSION,
    })
    const parsed = parseIbkrFlexXml(xml)

    if (parsed?.FlexQueryResponse) {
      return parsed
    }

    const status = ibkrFlexResponseStatus(parsed)
    const retryable = status?.errorCode && IBKR_FLEX_RETRYABLE_ERROR_CODES.has(status.errorCode)
    lastError = new Error(ibkrFlexErrorMessage(status))

    if (!retryable) {
      throw lastError
    }
  }

  throw lastError || new Error('IBKR Flex statement was not available before polling timed out.')
}

const normalizeIbkrFlexPosition = (position, statement, config) => {
  const accountId = readString(position, 'accountId') || readString(statement, 'accountId') || config.label
  const accountLabel = readString(position, 'acctAlias', 'accountAlias') || readString(statement, 'acctAlias', 'accountAlias') || accountId
  const positionCurrency = readString(position, 'currency') || config.baseCurrency || 'USD'
  const baseCurrency = config.baseCurrency || readString(statement?.AccountInformation, 'currency') || positionCurrency
  const symbol = readString(position, 'symbol', 'ticker', 'contractDesc').toUpperCase() || 'UNKNOWN'
  const description = readString(position, 'description', 'fullName', 'contractDesc') || symbol
  const rawSide = readString(position, 'side').toLowerCase()
  let signedQuantity = readNumber(position, 0, 'position', 'quantity')

  if (rawSide === 'short' && signedQuantity > 0) {
    signedQuantity = -signedQuantity
  }

  const side = rawSide === 'short' || signedQuantity < 0 ? 'short' : 'long'
  const fxRateToBase = readNumber(position, 1, 'fxRateToBase', 'fxRateToBaseCurrency')
  const sourceMarketValue = readNumber(position, signedQuantity * readNumber(position, 0, 'markPrice', 'closePrice', 'mktPrice'), 'positionValue', 'marketValue', 'mktValue')
  const baseMarketValue = readNumber(position, null, 'positionValueInBase', 'marketValueInBase')
  let marketValue = IBKR_FLEX_CONVERT_TO_BASE
    ? (baseMarketValue ?? sourceMarketValue * fxRateToBase)
    : sourceMarketValue

  if (side === 'short' && marketValue > 0) {
    marketValue = -marketValue
  }

  if (side === 'long' && signedQuantity > 0 && marketValue < 0) {
    marketValue = Math.abs(marketValue)
  }

  if (!signedQuantity && !marketValue) {
    return null
  }

  const pnlMultiplier = IBKR_FLEX_CONVERT_TO_BASE ? fxRateToBase : 1
  const pnl = readNumber(position, 0, 'fifoPnlUnrealized', 'unrealizedCapitalGainsPnl', 'unrealizedPnl') * pnlMultiplier
  const outputCurrency = IBKR_FLEX_CONVERT_TO_BASE ? baseCurrency : positionCurrency

  return {
    id: `ibkr:${accountId}:${readString(position, 'conid') || symbol}`,
    source: 'Interactive Brokers',
    portfolioId: config.portfolioId,
    portfolioLabel: config.label,
    accountId,
    accountLabel,
    assetClass: inferIbkrAssetClass(position),
    symbol,
    description,
    side,
    quantity: Math.abs(signedQuantity),
    signedQuantity,
    averagePrice: readNumber(position, 0, 'openPrice', 'costBasisPrice', 'avgPrice', 'avgCost'),
    currentPrice: readNumber(position, 0, 'markPrice', 'closePrice', 'mktPrice'),
    marketValue,
    costBasis: readNumber(position, 0, 'costBasisMoney') * (IBKR_FLEX_CONVERT_TO_BASE ? fxRateToBase : 1),
    pnl,
    pnlPercent: marketValue ? (pnl / Math.abs(marketValue)) * 100 : 0,
    currency: outputCurrency,
    reportDate: readString(position, 'reportDate') || readString(statement, 'toDate'),
  }
}

const normalizeIbkrFlexCash = (cashRow, statement, config) => {
  const rowCurrency = readString(cashRow, 'currency')
  const baseCurrency = config.baseCurrency || readString(statement?.AccountInformation, 'currency') || IBKR_FLEX_BASE_CURRENCY || 'USD'

  if (rowCurrency !== 'BASE_SUMMARY') {
    return null
  }

  const accountId = readString(cashRow, 'accountId') || readString(statement, 'accountId') || config.label
  const accountLabel = readString(cashRow, 'acctAlias', 'accountAlias') || readString(statement, 'acctAlias', 'accountAlias') || accountId
  const marketValue = readNumber(cashRow, 0, 'endingCash', 'endingSettledCash')

  if (!marketValue) {
    return null
  }

  return {
    id: `ibkr:${accountId}:base-cash`,
    source: 'Interactive Brokers',
    portfolioId: config.portfolioId,
    portfolioLabel: config.label,
    accountId,
    accountLabel,
    assetClass: 'Cash',
    symbol: 'BASE CASH',
    description: 'Base currency cash balance',
    kind: 'cash',
    side: 'cash',
    quantity: Math.abs(marketValue),
    signedQuantity: marketValue,
    averagePrice: 1,
    currentPrice: 1,
    marketValue,
    pnl: 0,
    pnlPercent: 0,
    currency: baseCurrency,
    reportDate: readString(cashRow, 'reportDate') || readString(statement, 'toDate'),
  }
}

const positionsFromIbkrFlexStatement = (parsed, config) => {
  const statements = asArray(parsed?.FlexQueryResponse?.FlexStatements?.FlexStatement)

  return statements.flatMap((statement) => {
    const openPositions = asArray(statement?.OpenPositions?.OpenPosition)
      .map((position) => normalizeIbkrFlexPosition(position, statement, config))
      .filter(Boolean)
    const cashPositions = asArray(statement?.CashReport?.CashReportCurrency)
      .map((cashRow) => normalizeIbkrFlexCash(cashRow, statement, config))
      .filter(Boolean)

    return [...openPositions, ...cashPositions]
  })
}

const fetchIbkrFlexPositions = async () => {
  const configs = ibkrFlexConfigs()
  const chunks = []
  const errors = []

  for (const config of configs) {
    try {
      const referenceCode = await requestIbkrFlexStatement(config)
      const statement = await retrieveIbkrFlexStatement(config, referenceCode)
      chunks.push(...positionsFromIbkrFlexStatement(statement, config))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${config.label} (${config.queryId}): ${message}`)
    }
  }

  if (chunks.length === 0 && errors.length > 0) {
    throw new Error(errors.join('; '))
  }

  if (errors.length > 0) {
    console.warn(`IBKR Flex loaded partial data: ${errors.join('; ')}`)
  }

  const deduped = new Map()

  for (const position of chunks) {
    deduped.set(position.id, position)
  }

  return Array.from(deduped.values())
}

const fetchIbkrPositions = async () => {
  if (IBKR_SOURCE_MODE === 'client-portal') {
    return fetchIbkrClientPortalPositions()
  }

  return fetchIbkrFlexPositions()
}

const createAccounts = (positions) => {
  const accounts = new Map()

  for (const position of positions) {
    if (!accounts.has(position.accountId)) {
      accounts.set(position.accountId, {
        id: position.accountId,
        label: position.accountLabel,
        source: position.source,
        portfolioId: position.portfolioId,
        baseCurrency: position.currency,
        equity: 0,
        hasReportedEquity: false,
      })
    }

    // Prefer a broker-reported account value (e.g. Hyperliquid marginSummary.accountValue);
    // otherwise net liquidity = sum of signed position market values (incl. the base-cash row).
    const account = accounts.get(position.accountId)
    const reportedEquity = position.accountEquity

    if (reportedEquity !== undefined && reportedEquity !== null && reportedEquity !== '') {
      account.equity = asNumber(reportedEquity)
      account.hasReportedEquity = true
    } else if (!account.hasReportedEquity) {
      account.equity += asNumber(position.marketValue)
    }
  }

  return Array.from(accounts.values()).map(({ hasReportedEquity, ...account }) => account)
}

// Accounts derived from positions win (they carry computed equity); source-declared
// accounts add any that have no positions (e.g. a flat Hyperliquid account).
const mergeAccounts = (derivedAccounts, explicitAccounts) => {
  const byId = new Map(derivedAccounts.map((account) => [account.id, account]))

  for (const account of explicitAccounts) {
    if (!byId.has(account.id)) {
      byId.set(account.id, account)
    }
  }

  return Array.from(byId.values())
}

const snapshotCurrency = (positions) => {
  const currencies = new Set(positions.map((position) => position.currency).filter(Boolean))

  if (currencies.size === 1) {
    return Array.from(currencies)[0]
  }

  return IBKR_FLEX_BASE_CURRENCY || 'USD'
}

const portfolioSnapshot = async () => {
  const requests = [
    { label: 'Hyperliquid', fetcher: fetchHyperliquidPositions },
    { label: 'Interactive Brokers', fetcher: fetchIbkrPositions },
  ]

  const settled = await Promise.allSettled(requests.map((request) => request.fetcher()))
  const positions = []
  const explicitAccounts = []
  const sources = settled.map((result, index) => {
    const { label } = requests[index]

    if (result.status === 'fulfilled') {
      // A fetcher returns either a positions array or { positions, accounts }.
      const value = result.value
      const resultPositions = Array.isArray(value) ? value : (value?.positions ?? [])
      const resultAccounts = Array.isArray(value) ? [] : (value?.accounts ?? [])
      positions.push(...resultPositions)
      explicitAccounts.push(...resultAccounts)
      return displaySourceStatus(label, 'ok', resultPositions.length)
    }

    return displaySourceStatus(label, 'error', 0, result.reason instanceof Error ? result.reason.message : String(result.reason))
  })
  const okCount = sources.filter((source) => source.ok).length

  if (okCount === 0) {
    return {
      statusCode: 503,
      payload: {
        success: false,
        status: {
          mode: 'sample',
          message: 'No live broker sources are available.',
          refreshedAt: new Date().toISOString(),
          sources,
        },
      },
    }
  }

  const refreshedAt = new Date().toISOString()

  return {
    statusCode: 200,
    payload: {
      success: true,
      snapshot: {
        id: `portfolio-bridge-${Date.now()}`,
        currency: snapshotCurrency(positions),
        asOf: refreshedAt,
        accounts: mergeAccounts(createAccounts(positions), explicitAccounts),
        positions,
      },
      status: {
        mode: okCount === requests.length ? 'live' : 'partial',
        message: okCount === requests.length
          ? 'Loaded live Hyperliquid and IBKR data from the local portfolio bridge.'
          : 'Loaded partial live data from the local portfolio bridge.',
        refreshedAt,
        sources,
      },
    },
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      jsonResponse(res, 200, {
        ok: true,
        service: 'positionsizer-portfolio-bridge',
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/portfolio/snapshot') {
      const result = await portfolioSnapshot()
      jsonResponse(res, result.statusCode, result.payload)
      return
    }

    jsonResponse(res, 404, {
      success: false,
      error: 'Not found',
    })
  } catch (error) {
    jsonResponse(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Portfolio bridge listening on http://${HOST}:${PORT}`)
})
