# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1](https://github.com/yldfi/maverick-v2-math/compare/v1.1.0...v1.1.1) (2026-10-12)


### Bug Fixes

* **deps:** patch vulnerable dev tooling (Dependabot alerts) ([e0e6ab6](https://github.com/yldfi/maverick-v2-math/commit/e0e6ab6c36bd407f9dce5f163a2b318eebfae1fc))

## [1.1.0](https://github.com/yldfi/maverick-v2-math/compare/v1.0.0...v1.1.0) (2026-07-15)


### Features

* initial commit ([2d0a964](https://github.com/yldfi/maverick-v2-math/commit/2d0a9649cacd06834fef3f4558bc39cc3c832d21))


### Bug Fixes

* traverse empty tick gaps ([3dc6082](https://github.com/yldfi/maverick-v2-math/commit/3dc60822ae4fa8196940f6e6d0b57313e472bcbe))

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
