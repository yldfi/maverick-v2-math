# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 (2026-06-16)

### Features

- **Maverick V2 swap math** (`@yldfi/maverick-v2-math`)
  - `computeSwapExactIn` / `computeSwapExactOut` matching on-chain `SwapMath`
  - Multi-tick simulation with `simulateSwapExactIn` / `simulateSwapExactOut`
  - Max-swap helpers `getMaxSwapExactIn` / `getMaxSwapExactOut`
  - Tick liquidity helpers `getTickL`, `tickSqrtPrice`, `getTickSqrtPriceAndL`
- **PoolLens utilities** (`poolLens`)
  - `getSwapQuote`, `getPriceInfo`, `getTickInfo`, `getActiveTickInfo`
  - `determineTickMode` from on-chain bin kinds
- **RPC utilities** (`@yldfi/maverick-v2-math/rpc`)
  - `fetchFullPoolState`, `fetchPoolSnapshot`, `fetchPoolConfig`
  - `fetchTickWithMode`, `fetchBin`
  - Inline Keccak-256 for selector / calldata encoding
- **Zero runtime dependencies** — pure TypeScript with native `BigInt`
- Dual CJS + ESM builds with TypeScript declarations

### Security

- No external runtime dependencies
- `pnpm audit` clean
