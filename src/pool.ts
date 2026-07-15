import { MIN_TICK_32, MAX_TICK_32 } from './constants.js';
import { tickSqrtPrice, tickSqrtPrices, getTickL } from './tickMath.js';
import { computeSwapExactIn, computeSwapExactOut, type TickDataInput } from './swapMath.js';
import type { PoolConfig, SimulatedSwap, TickDelta, TickState } from './types.js';

export interface PoolSnapshot {
  poolSqrtPrice: bigint;
  activeTick: number;
  reserveA: bigint;
  reserveB: bigint;
  protocolFeeRatioD3: number;
}

export type TickFetcher = (tick: number) => TickState | null;

const TICK_SEARCH_LIMIT = 200;

// Crossing an empty tick consumes no input but moves the virtual price to its edge.
function movePriceAcrossEmptyGap(
  sqrtPrice: bigint,
  sqrtLowerPrice: bigint,
  sqrtUpperPrice: bigint,
  tokenAIn: boolean,
): bigint {
  if (tokenAIn && sqrtPrice < sqrtLowerPrice) return sqrtLowerPrice;
  if (!tokenAIn && sqrtPrice > sqrtUpperPrice) return sqrtUpperPrice;
  return sqrtPrice;
}

function findStartingTick(poolSqrtPrice: bigint, tickSpacing: number, _getTick: TickFetcher): number {
  let tick = 0;
  const maxSearch = 10000;

  const p0 = tickSqrtPrice(tickSpacing, 0);
  const searchDirection = poolSqrtPrice < p0 ? -1 : 1;

  for (let i = 0; i < maxSearch; i++) {
    const lower = tickSqrtPrice(tickSpacing, tick);
    const upper = tickSqrtPrice(tickSpacing, tick + 1);
    if (poolSqrtPrice >= lower && poolSqrtPrice < upper) return tick;
    tick += searchDirection;
  }
  return tick;
}

export function simulateSwapExactIn(
  pool: PoolSnapshot,
  config: PoolConfig,
  getTick: TickFetcher,
  amountIn: bigint,
  tokenAIn: boolean,
  tickLimit?: number,
): SimulatedSwap {
  let remainingIn = amountIn;
  let totalOut = 0n;
  let currentSqrtPrice = pool.poolSqrtPrice;
  const tickDeltas: TickDelta[] = [];

  const fee = tokenAIn ? config.feeAIn : config.feeBIn;
  const limit = tickLimit ?? (tokenAIn ? MAX_TICK_32 : MIN_TICK_32);
  const tickSpacing = config.tickSpacing;

  const direction = tokenAIn ? 1 : -1;
  let currentTick = findStartingTick(currentSqrtPrice, tickSpacing, getTick);

  let iterations = 0;
  let reachedLimit = false;

  while (remainingIn > 0n && iterations < TICK_SEARCH_LIMIT) {
    if (tokenAIn && currentTick > limit) { reachedLimit = true; break; }
    if (!tokenAIn && currentTick < limit) { reachedLimit = true; break; }

    const absTick = Math.abs(currentTick) * tickSpacing;
    if (absTick > MAX_TICK_32) { reachedLimit = true; break; }

    const { sqrtLowerPrice, sqrtUpperPrice } = tickSqrtPrices(tickSpacing, currentTick);
    currentSqrtPrice = movePriceAcrossEmptyGap(
      currentSqrtPrice,
      sqrtLowerPrice,
      sqrtUpperPrice,
      tokenAIn,
    );

    if (currentSqrtPrice < sqrtLowerPrice || currentSqrtPrice > sqrtUpperPrice) {
      currentTick += direction;
      iterations++;
      continue;
    }

    const tickState = getTick(currentTick);
    if (!tickState || tickState.totalSupply === 0n) {
      currentTick += direction;
      iterations++;
      continue;
    }

    const liquidity = getTickL(
      tickState.reserveA,
      tickState.reserveB,
      sqrtLowerPrice,
      sqrtUpperPrice,
    );

    if (liquidity === 0n) {
      currentTick += direction;
      iterations++;
      continue;
    }

    const tickData: TickDataInput = {
      currentReserveA: tickState.reserveA,
      currentReserveB: tickState.reserveB,
      currentLiquidity: liquidity,
    };

    const result = computeSwapExactIn(
      currentSqrtPrice,
      tickData,
      remainingIn,
      tokenAIn,
      fee,
      BigInt(pool.protocolFeeRatioD3),
      sqrtLowerPrice,
      sqrtUpperPrice,
    );

    totalOut += result.deltaOutErc;
    remainingIn = result.excess;
    currentSqrtPrice = result.endSqrtPrice;

    tickDeltas.push({
      tick: currentTick,
      deltaIn: result.deltaInErc,
      deltaOut: result.deltaOutErc,
    });

    if (!result.swappedToMaxPrice || remainingIn === 0n) break;

    currentTick += direction;
    iterations++;
  }

  return {
    amountIn: amountIn - remainingIn,
    amountOut: totalOut,
    tickDeltas,
    endTick: currentTick,
    swappedToMaxPrice: remainingIn > 0n || reachedLimit,
    excess: remainingIn,
  };
}

export function simulateSwapExactOut(
  pool: PoolSnapshot,
  config: PoolConfig,
  getTick: TickFetcher,
  amountOut: bigint,
  tokenAIn: boolean,
  tickLimit?: number,
): SimulatedSwap {
  let remainingOut = amountOut;
  let totalIn = 0n;
  let currentSqrtPrice = pool.poolSqrtPrice;
  const tickDeltas: TickDelta[] = [];

  const fee = tokenAIn ? config.feeAIn : config.feeBIn;
  const limit = tickLimit ?? (tokenAIn ? MAX_TICK_32 : MIN_TICK_32);
  const tickSpacing = config.tickSpacing;

  const direction = tokenAIn ? 1 : -1;
  let currentTick = findStartingTick(currentSqrtPrice, tickSpacing, getTick);

  let iterations = 0;
  let reachedLimit = false;

  while (remainingOut > 0n && iterations < TICK_SEARCH_LIMIT) {
    if (tokenAIn && currentTick > limit) { reachedLimit = true; break; }
    if (!tokenAIn && currentTick < limit) { reachedLimit = true; break; }

    const absTick = Math.abs(currentTick) * tickSpacing;
    if (absTick > MAX_TICK_32) { reachedLimit = true; break; }

    const { sqrtLowerPrice, sqrtUpperPrice } = tickSqrtPrices(tickSpacing, currentTick);
    currentSqrtPrice = movePriceAcrossEmptyGap(
      currentSqrtPrice,
      sqrtLowerPrice,
      sqrtUpperPrice,
      tokenAIn,
    );

    if (currentSqrtPrice < sqrtLowerPrice || currentSqrtPrice > sqrtUpperPrice) {
      currentTick += direction;
      iterations++;
      continue;
    }

    const tickState = getTick(currentTick);
    if (!tickState || tickState.totalSupply === 0n) {
      currentTick += direction;
      iterations++;
      continue;
    }

    const liquidity = getTickL(
      tickState.reserveA,
      tickState.reserveB,
      sqrtLowerPrice,
      sqrtUpperPrice,
    );

    if (liquidity === 0n) {
      currentTick += direction;
      iterations++;
      continue;
    }

    const tickData: TickDataInput = {
      currentReserveA: tickState.reserveA,
      currentReserveB: tickState.reserveB,
      currentLiquidity: liquidity,
    };

    const result = computeSwapExactOut(
      currentSqrtPrice,
      tickData,
      remainingOut,
      tokenAIn,
      fee,
      BigInt(pool.protocolFeeRatioD3),
      sqrtLowerPrice,
      sqrtUpperPrice,
    );

    totalIn += result.deltaInErc;
    remainingOut = result.excess;
    currentSqrtPrice = result.endSqrtPrice;

    tickDeltas.push({
      tick: currentTick,
      deltaIn: result.deltaInErc,
      deltaOut: result.deltaOutErc,
    });

    if (!result.swappedToMaxPrice || remainingOut === 0n) break;

    currentTick += direction;
    iterations++;
  }

  return {
    amountIn: totalIn,
    amountOut: amountOut - remainingOut,
    tickDeltas,
    endTick: currentTick,
    swappedToMaxPrice: remainingOut > 0n || reachedLimit,
    excess: remainingOut,
  };
}
