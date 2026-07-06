# Position Sizer — Code Review

**Branch reviewed:** `codex/portfolio-heatmap-dashboard`
**Date:** 2026-06-30
**Scope:** Whole codebase, with emphasis on the new Portfolio Heatmap dashboard (`src/portfolio/**`, `scripts/portfolio-bridge.mjs`) and the position-sizing math in `src/App.jsx`.
**Method:** Multi-agent review across six dimensions (sizing math, React state, the Node bridge, the frontend adapter, security, quality). Every candidate finding was independently re-checked against the source by a separate adversarial verifier before inclusion. `eslint` passes clean. **26 findings confirmed, 0 rejected → 24 unique after merging duplicates. No critical or high-severity issues.**

---

## Summary

| # | Severity | Area | Issue | File |
|---|----------|------|-------|------|
| M1 | Medium | Sizing math | Equity share count rounds **up**, so true risk can exceed the stated risk % while "Risk Amount" still shows the full budget | `src/App.jsx` |
| M2 | Medium | Data integrity | Stale FX rate from the previous currency pair is reused in the calc (esp. permanently after a failed fetch) | `src/App.jsx` |
| M3 | Medium | Race | Out-of-order FX responses can leave the wrong rate (no request sequencing) | `src/App.jsx` |
| M4 | Medium | Race | Out-of-order futures price responses apply the wrong contract's price after a contract switch | `src/App.jsx` |
| M5 | Medium | React | Treemap ECharts instance is **disposed + re-created on every refresh/filter** — loses drill-down/zoom, double-applies `setOption` | `src/portfolio/PortfolioTreemap.jsx` |
| M6 | Medium | Data integrity | Partial IBKR Flex failures are hidden — source shows green while one account's positions are silently missing | `scripts/portfolio-bridge.mjs` |
| M7 | Medium | Data integrity | IBKR personal/SMSF inferred from a label substring; Client-Portal path misclassifies personal holdings as SMSF | `src/portfolio/PortfolioDashboard.jsx` |
| M8 | Medium | Correctness | Bridge `portfolioId` values don't match the hard-coded filter ids → positions un-counted and un-toggleable out of the box | `src/portfolio/PortfolioDashboard.jsx` |
| M9 | Medium | Data integrity | Cash is added to gross/net/long **exposure** but excluded from the position count — inflates the risk metrics | `src/portfolio/samplePortfolioSnapshot.js` |
| M10 | Medium | Security (XSS) | Tooltip interpolates `position.side` into `innerHTML` **without escaping** (every other field is escaped) | `src/portfolio/PortfolioTreemap.jsx` |
| M11 | Medium | Security | Live prices routed through public CORS proxies (`r.jina.ai`, `allorigins.win`), trusted blindly, with an `http://` downgrade | `src/App.jsx` |
| M12 | Medium | Resilience | Lazy dashboard has a Suspense fallback but **no error boundary** — a chunk-load failure blanks the whole app | `src/App.jsx` |
| L1 | Low | Race | Dashboard refresh has no in-flight/latest-wins guard (mostly mitigated by `disabled={loading}`) | `src/portfolio/PortfolioDashboard.jsx` |
| L2 | Low | Data integrity | Hyperliquid mid lookup uppercases the coin → `k`-prefixed perps (kPEPE…) fall back to stale entry price for display | `scripts/portfolio-bridge.mjs` |
| L3 | Low | Correctness | `asNumber(mktPrice, last)` passes the fallback unparsed → raw string/`undefined` can leak into `currentPrice` | `scripts/portfolio-bridge.mjs` |
| L4 | Low | Robustness | IBKR Flex polling fires the first `GetStatement` with no initial delay and no backoff (aggravates rate-limit 1018) | `scripts/portfolio-bridge.mjs` |
| L5 | Low | Maintainability | Asset-class symbol sets + classifier duplicated in the adapter and the bridge, and **already diverged** | `portfolioDataAdapter.js` / `portfolio-bridge.mjs` |
| L6 | Low | Security | IBKR Flex `queryId` leaked into the browser-facing error payload and server logs | `scripts/portfolio-bridge.mjs` |
| L7 | Low | Security | Email allowlist is client-side only; the bridge/trading API enforce no authorization | `src/AuthContext.jsx` |
| L8 | Low | Resilience | `formatCurrency` throws `RangeError` on a malformed broker currency code — can crash the treemap on render/hover | `src/portfolio/PortfolioTreemap.jsx` |
| L9 | Low | Dead code | The CryptoTradeApi normalization layer (~165 lines) is vestigial now that the bridge returns a pre-normalized snapshot | `src/portfolio/portfolioDataAdapter.js` |
| L10 | Low | Dead code | `getPositionLabel` has two byte-identical branches | `src/portfolio/PortfolioTreemap.jsx` |
| L11 | Low | Testing | No test harness anywhere for the core financial math | repo-wide |
| L12 | Low | UX/PWA | `autoUpdate` precache + "Works offline" footer, but all data comes from un-cached live fetches | `vite.config.js` |

---

## What's solid

- **Futures math is careful and correct:** `Math.floor` to whole contracts, a separate `actualRisk` readout, tick-alignment validation, and a clear point-value model. This is the standard the equity branch (M1) should match.
- **Bridge keeps broker tokens server-side** and binds to `127.0.0.1` — the right architecture for not shipping secrets in the bundle.
- **Layered data fallback** (bridge → CryptoTradeApi → sample snapshot) with `Promise.allSettled` and per-source health reporting is a good resilience pattern.
- **Tooltip escaping is mostly thorough** — `symbol`, `description`, `accountLabel`, `params.name` are all run through `escapeHtml`; only `side` (M10) slipped through.
- `eslint` passes with zero warnings.

---

## Detail & fixes

### Medium

**M1 — Equity size rounds up, understating risk** · `src/App.jsx:539-540, 1030`, `581-585`
The equity branch computes `positionSize = riskAmountTarget / riskPerUnit` with no flooring, and the UI renders `{formatNumber(result.positionSize, 0)} shares` where `formatNumber` uses `maximumFractionDigits: 0` (rounds to nearest). So `33.7` shows as **"34 shares"** while "Risk Amount" still shows the full budget — a trader buying 34 risks more than stated. The futures branch already does this correctly.
**Fix:** Floor the share count for the actionable size and compute/display an "Actual Risk" from the floored size, mirroring the futures branch. At minimum never round *up* past the budget.

**M2 — Stale FX rate reused** · `src/App.jsx:207-241, 374-376, 432-435, 493-494`
`fetchExchangeRate` doesn't clear `exchangeRate` before fetching and, on failure, only sets `rateError` — leaving the previous pair's numeric rate in state. `calculatePositionSize` bails only when the rate `isNaN`, so a stale-but-valid number flows into `riskAmountTarget = riskAmountAccount * effectiveRate` and the result panel renders a confidently-wrong size. (Note: `rateError` *is* shown, so it's not fully silent, but the wrong result still displays.)
**Fix:** Reset `exchangeRate` to `''` on currency-pair change and in the `catch` block so the `isNaN` guard suppresses the result until a valid current-pair rate arrives. Optionally tag the rate with its from/to pair and ignore it when the pair no longer matches.

**M3 — Out-of-order FX responses** · `src/App.jsx:207-241, 374-376`
No `AbortController`/sequence guard. Rapid USD→AUD then USD→EUR fires two overlapping fetches; if AUD resolves last, `exchangeRate` ends up holding the AUD rate while EUR is selected. The Refresh button races the auto-effect the same way.
**Fix:** Capture the target pair (or a monotonic request id / `AbortController`) per call and ignore any response whose pair no longer matches before `setExchangeRate`.

**M4 — Out-of-order futures price after contract switch** · `src/App.jsx:338-360, 385-402`
`fetchFuturesPrice` captures `activeFuturesContract` and isn't cancellable. Switching contract during an in-flight request can let the old contract's Yahoo response resolve last and call `setEntryPrice`/`setFetchedPrice` with the wrong price (self-corrects on the next 15 s tick).
**Fix:** Pass the target contract code in and bail after the `await` if `futuresContractCode` no longer matches, or use an `AbortController` keyed to the active contract.

**M5 — Treemap re-initialised on every refresh** · `src/portfolio/PortfolioTreemap.jsx:280-305`
The init effect depends on `[option]`; since `option` is a `useMemo` of `snapshot`, every refresh/filter toggle runs `chart.dispose()` and `echarts.init(...)` again — destroying drill-down/breadcrumb state (`nodeClick: 'zoomToNode'`) and making the second `setOption(option, true)` effect redundant. (Flagged independently by two reviewers.)
**Fix:** Give the init effect `[]` deps (create/dispose on mount only); let the second effect push `setOption(option, true)` updates. Preserves zoom state and removes the double apply.

**M6 — Partial IBKR Flex failures hidden** · `scripts/portfolio-bridge.mjs:640-646`
`fetchIbkrFlexPositions` only throws when *every* configured query fails. With multiple accounts/queries, a single failure is just `console.warn`'d and the partial set returns "fulfilled" — so the IBKR source shows **ok / green** with no error and the snapshot reads "live" while one account's positions are silently missing (understated exposure).
**Fix:** Propagate per-config errors to the snapshot (a `warnings`/`partialErrors` field) so `displaySourceStatus` can show a degraded indicator when `errors.length > 0`.

**M7 — IBKR personal/SMSF label-substring misclassification** · `src/portfolio/PortfolioDashboard.jsx:47-55`
For positions with no explicit `portfolioId` (the IBKR **Client Portal** path emits none), `positionFilterId` infers the bucket from whether the label contains `"personal"`. Account labels are numbers/aliases (`U18651415`, `1537187`) that never contain that word, so everything defaults to `ib-smsf` and "IB Personal" shows 0. Personal vs SMSF is tax-significant. (The default **Flex** path is unaffected — it sets `portfolioId` explicitly.)
**Fix:** Map by real account identifier (explicit `accountId → filterId` map, or have the bridge always emit a `portfolioId` equal to the filter id), with a visible `ib-other` fallback rather than silently defaulting to SMSF.

**M8 — Bridge `portfolioId` doesn't match hard-coded filter ids** · `src/portfolio/PortfolioDashboard.jsx:60-85`
`PORTFOLIO_FILTERS` hard-codes `hyperliquid`/`ib-personal`/`ib-smsf`, but the Flex path sets `portfolioId` to `${prefix}_FILTER_ID || 'ibkr-account-N'` (or `'ibkr-flex'`). Unless the operator sets `*_FILTER_ID` to exactly those ids, (1) `filterPositionCounts` increments keys the UI never renders (counts under-report) and (2) `filterSnapshot` does `activeFilters[id] ?? true`, so unknown ids are **always visible and can never be toggled off**. This is the out-of-the-box behaviour for live Flex data.
**Fix:** Derive `PORTFOLIO_FILTERS` from the snapshot's actual `portfolioId`/`portfolioLabel`, or validate/document that the bridge must emit one of the known ids; at minimum render an "Other" filter for unmatched ids.

**M9 — Cash inflates exposure stats** · `src/portfolio/samplePortfolioSnapshot.js:173-189`
`calculatePortfolioStats` guards cash only for `positionCount`; `grossExposure`, `netExposure` and `longExposure` add the cash `marketValue` unconditionally. The sample's $100,048 BASE CASH row therefore inflates "Gross/Net Exposure" by ~$100k, and the treemap renders cash as a dominating node.
**Fix:** Apply the `kind === 'cash'` guard to the exposure aggregates too (or track cash separately), and either exclude cash from the treemap exposure series or relabel the stat "Gross Market Value".

**M10 — Unescaped `side` in tooltip (XSS sink)** · `src/portfolio/PortfolioTreemap.jsx:165, 182`
The ECharts formatter return is rendered as HTML. `symbol`/`description`/`accountLabel`/`name` are escaped, but `side` is interpolated raw (`.toUpperCase()` doesn't neutralize HTML — tags are case-insensitive). `normalizeSide` returns the raw lowercased broker string when it isn't long/short, so a malicious/MITM'd CryptoTradeApi response (`side: "<img src=x onerror=…>"`) executes on hover. The author already treats this feed as untrusted (escapes the neighbours), so this is a gap in their own model.
**Fix:** `${escapeHtml(side)}`, ideally after constraining `side` to a known enum.

**M11 — Live prices via public CORS proxies** · `src/App.jsx:101-131`
Equity/futures quotes go through `r.jina.ai` and `api.allorigins.win`, the body is `JSON.parse`'d and used directly as the price feeding `calculatePositionSize`. (1) Every queried ticker leaks to uncontrolled third parties; (2) a compromised proxy can return any number and silently drive trade sizing; (3) line 106 force-downgrades the upstream leg to `http://`.
**Fix:** Proxy Yahoo through your own backend (you already run a Vite `/trading-api` proxy and the bridge), keep HTTPS end-to-end, and sanity-check the quote (finite, positive, within a plausible band) before using it.

**M12 — Lazy dashboard has no error boundary** · `src/App.jsx:653-658`
`PortfolioDashboard` is a `lazy` chunk wrapped only in `Suspense`. A rejected dynamic import (realistic for a PWA serving a stale hashed chunk after redeploy) or a render-time throw propagates to the root and unmounts the **entire** app, blanking the calculator too. There is no error boundary anywhere in the tree.
**Fix:** Wrap the `Suspense` in a small error boundary that isolates the failure to the dashboard view and offers a reload.

### Low

**L1 — Dashboard refresh no in-flight guard** · `PortfolioDashboard.jsx:107-129` — No abort/latest-wins sequencing; largely mitigated because Refresh is `disabled={loading}`, leaving only the StrictMode dev double-invoke (identical results). Add a request-id/abort guard if desired.

**L2 — Hyperliquid mid lookup uppercases coin** · `portfolio-bridge.mjs:145-147` — `k`-prefixed perps (kPEPE/kSHIB/kBONK) never match `mids["KPEPE"]`, so `currentPrice` falls back to entry price. `marketValue` is rescued by `position.positionValue`, so impact is display-only. Look up by the raw coin name before falling back.

**L3 — `asNumber` fallback unparsed** · `portfolio-bridge.mjs:304` — `asNumber(position.mktPrice, position.last)` returns `last` verbatim (string/`undefined`) when `mktPrice` is missing. Nest it: `asNumber(position.mktPrice, asNumber(position.last))`, as line 305/325 already do.

**L4 — IBKR Flex polling, no initial delay/backoff** · `portfolio-bridge.mjs:479-502` — First `GetStatement` fires immediately (statement never ready), normally wasting one attempt on code 1019, and retries at a flat cadence on 1018. Add an initial delay and exponential backoff on retryable codes.

**L5 — Asset-class logic duplicated & diverged** · `portfolioDataAdapter.js:13-15,45-70` vs `portfolio-bridge.mjs:27-29,241-279` — Identical symbol Sets and an already-divergent classifier (the bridge branches on `assetCategory` first; the adapter doesn't), so the same position can classify differently by load path. `createAccounts` is also duplicated byte-for-byte. Extract a shared ESM module imported by both.

**L6 — Flex `queryId` leaked to client/logs** · `portfolio-bridge.mjs:636,645,708` — The semi-secret `queryId` is embedded in error strings returned to the browser via `sources[].error` and written to stdout. The token itself is never leaked. Return a generic message to the client; keep identifiers server-side (or hash them).

**L7 — Allowlist is client-side only** · `src/AuthContext.jsx:7,32-46` — `ALLOWED_EMAILS` only gates UI rendering; the bridge has no inbound auth. Dev bypass and `VITE_TRADING_API_KEY` are correctly DEV-gated (not prod-exploitable), and the Firebase `apiKey` exposure is expected. Treat the allowlist as UX and enforce authz server-side on any endpoint that returns real broker data.

**L8 — `formatCurrency` `RangeError`** · `PortfolioTreemap.jsx:29-36` — `Intl.NumberFormat({style:'currency', currency})` throws on a non-ISO code (empty/garbage, even `USDT`/`USDC`). `currency` comes unvalidated from broker/snapshot data and is used both in the tooltip and during render (so a bad `snapshot.currency` crashes the whole treemap with no error boundary). Validate against `/^[A-Z]{3}$/` with a `USD` fallback, or wrap in try/catch.

**L9 — Vestigial CryptoTradeApi layer** · `portfolioDataAdapter.js:84-250` — `loadFromPortfolioBridge` passes the snapshot through un-normalized, so `normalizePosition`/`fetchPositions`/`inferSource`/the symbol Sets/`DEV_API_KEY` exist only for the secondary CryptoTradeApi fallback. If that backend is no longer a target, delete the layer; otherwise move it to its own module instead of re-deriving classification the bridge already does.

**L10 — `getPositionLabel` identical branches** · `PortfolioTreemap.jsx:57-65` — The `kind === 'cash'` branch returns the exact same string as the default. Collapse to one return (or make cash actually differ).

**L11 — No tests for the financial math** · repo-wide — No `test` script and no test runner; `calculatePositionSize` and `calculatePortfolioStats` are untested. Add Vitest (Vite-native), extract the calc core into a pure function, and add table-driven tests (long/short, FX vs no-FX, futures whole-contract rounding, tick rejection, R-factor, long/short/net signs).

**L12 — PWA offline claim vs behaviour** · `vite.config.js:23-49` — `autoUpdate` + shell precache, but every price/FX/snapshot is an un-cached cross-origin fetch, so "Works offline" only covers manual-entry sizing. Soften the copy or add a `runtimeCaching` NetworkFirst strategy for the data endpoints.

---

## Suggested order of work

1. **M1, M2** — they put wrong money numbers in front of a trader; cheap to fix.
2. **M6, M8, M7, M9** — portfolio dashboard data-integrity/usability (silent missing data, broken filters, inflated exposure, misbucketed accounts).
3. **M10, M11, L6, L7** — security hardening (escape `side`, self-host the price proxy, stop leaking the queryId, document the allowlist boundary).
4. **M5, M12, L8** — dashboard resilience (preserve chart state, error boundary, currency validation).
5. **M3, M4, L1–L5, L9–L12** — races, robustness, dead code, tests, and the shared-classifier refactor.

> Generated by a multi-agent review (6 reviewers + per-finding adversarial verification). Severities are the verifier-adjusted values; several originally-"high" findings were downgraded to medium after the verifier confirmed they're gated behind non-default config paths.
