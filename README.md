![@yldfi/maverick-v2-math](logo-128.png)

# @yldfi/maverick-v2-math

Off-chain TypeScript implementation of [Maverick V2](https://maverick.xyz/) AMM swap math for gas-free quote calculations.

[![npm version](https://badge.fury.io/js/@yldfi%2Fmaverick-v2-math.svg)](https://www.npmjs.com/package/@yldfi/maverick-v2-math) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Bin-level swap math** — Exact-in / exact-out calculations matching on-chain `SwapMath`
- **Multi-tick simulation** — Walk through consecutive ticks just like the pool contract
- **Max-swap estimation** — Compute the largest swap that drains a tick or the whole pool
- **Tick & liquidity helpers** — `getTickL`, `tickSqrtPrice`, `getPriceInfo`, `getTickInfo`
- **Zero runtime dependencies** — Pure TypeScript with native `BigInt`
- **Browser compatible** — Works in Node.js and browsers (ES2020+)
- **Optional RPC utilities** — Fetch pool state, bins, and ticks via JSON-RPC with no extra deps
- **Verified against mainnet** — Off-chain quotes match the Maverick V2 Quoter within ±1 wei

## Installation

```bash
npm install @yldfi/maverick-v2-math
# or
pnpm add @yldfi/maverick-v2-math
# or
yarn add @yldfi/maverick-v2-math
```

## Usage

### Single-tick swap quote

```typescript
import { getTickInfo, getSwapQuote, tickSqrtPrice, getTickL, ONE } from '@yldfi/maverick-v2-math';

const tickSpacing = 50;
const tick = 177;
const reserveA = 1000n * ONE;
const reserveB = 500n * ONE;
const mode = 0; // TickMode.TOKEN_A

const tickInfo = getTickInfo(tick, tickSpacing, reserveA, reserveB, mode);
const poolSqrtPrice = tickInfo.sqrtPrice;

// Quote 1 tokenA in -> tokenB out
const quote = getSwapQuote(
  poolSqrtPrice,
  tickInfo,
  1n * ONE,
  true,        // tokenAIn
  false,       // exactOutput
  2000000000000000n, // 0.2% fee
  0,           // protocolFeeRatioD3
);

console.log(quote.amountOut.toString());
```

### Multi-tick swap simulation

```typescript
import { simulateSwapExactIn, type PoolSnapshot, type PoolConfig } from '@yldfi/maverick-v2-math';

const pool: PoolSnapshot = {
  poolSqrtPrice: 0x15a5401b3d0cdf02n,
  activeTick: 177,
  reserveA: 0n,
  reserveB: 0n,
  protocolFeeRatioD3: 0,
};

const config: PoolConfig = {
  tickSpacing: 50,
  feeAIn: 0x71afd498d0000n,      // 0.2%
  feeBIn: 0x38d7ea4c68000n,      // 0.1%
  protocolFeeRatioD3: 0,
  tokenAScale: 1n,
  tokenBScale: 1n,
  kinds: 2,                      // Left bins
};

const getTick = (t: number) => tickState[t] ?? null;

const result = simulateSwapExactIn(pool, config, getTick, 10n * ONE, true);
console.log(result.amountIn, result.amountOut, result.endTick);
```

### Max swap (drain a tick)

```typescript
import { getMaxSwapExactIn, getTickInfo } from '@yldfi/maverick-v2-math';

const tickInfo = getTickInfo(177, 50, reserveA, reserveB, /* mode */ 0);
const max = getMaxSwapExactIn(
  poolSqrtPrice,
  tickInfo,
  true,                // tokenAIn
  feeAIn,
  feeBIn,
  protocolFeeRatioD3,
);

console.log(max.amountIn, max.amountOut, max.swappedToMaxPrice);
```

### RPC helpers (optional)

```typescript
import { fetchFullPoolState, fetchPoolSnapshot } from '@yldfi/maverick-v2-math/rpc';

const rpc = { rpcUrl: 'https://eth.llamarpc.com' };
const poolAddress = '0x5e606e3f0c0afa2a545624ef65f6aa7e31a9772e';

const state = await fetchFullPoolState(rpc, poolAddress);
console.log(state.poolSqrtPrice, state.activeTick, state.tickSpacing);
```

## API Reference

### Core Swap Math

| Function | Description |
|----------|-------------|
| `computeSwapExactIn(sqrtPrice, tickData, amountIn, tokenAIn, fee, protocolFeeD3, sqrtLower, sqrtUpper)` | Exact-in swap for a single bin |
| `computeSwapExactOut(sqrtPrice, tickData, amountOut, tokenAIn, fee, protocolFeeD3, sqrtLower, sqrtUpper)` | Exact-out swap for a single bin |
| `TickMode` | `TOKEN_A = 0`, `TOKEN_B = 1`, `BOTH = 2` |
| `feeForTickMode(mode, tokenAIn, feeA, feeB)` | Returns the correct fee for the tick mode |

### Pool Lens

| Function | Description |
|----------|-------------|
| `getPriceInfo(sqrtPrice)` | Price, inverted price, and sqrt price |
| `getTickInfo(tick, tickSpacing, reserveA, reserveB, mode)` | Liquidity, sqrt bounds, and reserves for a tick |
| `getSwapQuote(poolSqrtPrice, tickInfo, amount, tokenAIn, exactOutput, fee, protocolFeeD3)` | Single-tick quote with fee breakdown |
| `getMaxSwapExactIn(poolSqrtPrice, tickInfo, tokenAIn, feeA, feeB, protocolFeeD3)` | Largest exact-in swap that stays in the tick |
| `getMaxSwapExactOut(poolSqrtPrice, tickInfo, tokenAIn, feeA, feeB, protocolFeeD3)` | Largest exact-out swap the tick can deliver |
| `determineTickMode(binKinds)` | Infer `TickMode` from a tick's bin kinds |
| `getActiveTickInfo(snapshot, config, tickState, mode)` | Convenience wrapper for the active tick |

### Multi-Tick Simulation

| Function | Description |
|----------|-------------|
| `simulateSwapExactIn(pool, config, getTick, amountIn, tokenAIn, tickLimit?)` | Walk ticks from current price until input is consumed |
| `simulateSwapExactOut(pool, config, getTick, amountOut, tokenAIn, tickLimit?)` | Walk ticks until requested output is obtained |

### Tick Math

| Function | Description |
|----------|-------------|
| `tickSqrtPrice(tickSpacing, tick)` | Sqrt price of a tick boundary |
| `tickSqrtPrices(tickSpacing, tick)` | Lower/upper sqrt prices for a tick |
| `getTickL(reserveA, reserveB, sqrtLower, sqrtUpper)` | Liquidity `L` from tick reserves |
| `getTickSqrtPriceAndL(...)` | Combined sqrt price + liquidity helper |

### RPC Utilities

| Function | Description |
|----------|-------------|
| `fetchFullPoolState(rpc, poolAddress)` | Fetch full pool state + active tick mode |
| `fetchPoolSnapshot(rpc, poolAddress)` | Fetch pool sqrt price, active tick, and reserves |
| `fetchPoolConfig(rpc, poolAddress)` | Fetch fees, scales, kinds, tick spacing |
| `fetchTickWithMode(rpc, poolAddress, tick)` | Fetch tick reserves and determine `TickMode` |
| `fetchBin(rpc, poolAddress, binId)` | Fetch a single bin's state |
| `selector(signature)` | Compute a function selector using inline Keccak-256 |
| `encodeFunctionCall(signature, args)` | Encode an `eth_call` data payload |

## Testing Accuracy

The math is tested against on-chain Maverick V2 Quoter results on mainnet. For production use with financial consequences, we recommend:

1. **Verify against on-chain**: compare `getSwapQuote` results with the pool's Quoter contract
2. **Add slippage tolerance**: always apply a min-out / max-in buffer (e.g., 50–100 bps)
3. **Run periodic regression tests**: re-test against live pools after protocol upgrades

```typescript
import { getSwapQuote } from '@yldfi/maverick-v2-math';
import { fetchFullPoolState } from '@yldfi/maverick-v2-math/rpc';

const state = await fetchFullPoolState({ rpcUrl }, pool);
const tickInfo = getActiveTickInfo(state, state.config, state.activeTick, state.activeTick.mode);
const offChain = getSwapQuote(state.poolSqrtPrice, tickInfo, dx, true, false, fee, 0);
```

## Tick Mode Reference

| Bin Kind | Direction | TickMode | Fee Flip |
|----------|-----------|----------|----------|
| `0` Static | None | `TOKEN_A` | No |
| `1` Right | B→A (price up) | `TOKEN_B` | Yes |
| `2` Left | A→B (price down) | `TOKEN_A` | No |
| `3` Both | Both | `BOTH` | No |

## References

- [Maverick V2 Documentation](https://docs.mav.xyz/)
- [Maverick V2 Contracts](https://github.com/maverick-protocol/maverick-v2)
- [ParaSwap Maverick V2 Math Reference](https://github.com/VeloraDEX/paraswap-dex-lib/tree/main/src/dex/maverick-v2/maverick-math)

## License

MIT
