import { ONE } from './constants.js';
import { mulDown, divDown } from './math.js';
import { tickSqrtPrices, getTickSqrtPriceAndL } from './tickMath.js';
import type { TickState } from './types.js';
import {
  TickMode, feeForTickMode,
  TickDataInput, SwapTickResult,
  computeSwapExactIn, computeSwapExactOut,
} from './swapMath.js';

export { TickMode, feeForTickMode } from './swapMath.js';

export interface PriceInfo {
  sqrtPrice: bigint;
  price: bigint;
  priceInverted: bigint;
}

export interface TickInfo {
  tick: number;
  sqrtLower: bigint;
  sqrtUpper: bigint;
  sqrtPrice: bigint;
  liquidity: bigint;
  reserveA: bigint;
  reserveB: bigint;
  mode: TickMode;
}

export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  totalFee: bigint;
  protocolFee: bigint;
  lpFee: bigint;
  endSqrtPrice: bigint;
  endPrice: bigint;
  priceImpactD18: bigint;
  excess: bigint;
  swappedToMaxPrice: boolean;
}

/** 
 * Determine TickMode from tick's bin kinds array (order matches binIdsByTick).
 * Right(1)→TOKEN_B (flipped fee), Left(2)→TOKEN_A (standard), Both(3)→BOTH.
 */
export function determineTickMode(binKinds: number[]): TickMode {
  let hasRight = false;
  let hasLeft = false;
  let hasBoth = false;
  for (const kind of binKinds) {
    if (kind === 1) hasRight = true;
    else if (kind === 2) hasLeft = true;
    else if (kind === 3) hasBoth = true;
  }
  if (hasRight && (hasLeft || hasBoth)) return TickMode.BOTH;
  if (hasRight) return TickMode.TOKEN_B;
  return TickMode.TOKEN_A;
}

export function getPriceInfo(sqrtPrice: bigint): PriceInfo {
  const price = (sqrtPrice * sqrtPrice) / ONE;
  const priceInverted = price === 0n ? 0n : (ONE * ONE) / price;
  return { sqrtPrice, price, priceInverted };
}

export function getTickInfo(
  tick: number,
  tickSpacing: number,
  reserveA: bigint,
  reserveB: bigint,
  mode: TickMode,
): TickInfo {
  const { sqrtLowerPrice, sqrtUpperPrice } = tickSqrtPrices(tickSpacing, tick);
  const { sqrtPrice, liquidity } = getTickSqrtPriceAndL(reserveA, reserveB, sqrtLowerPrice, sqrtUpperPrice);
  return {
    tick, sqrtLower: sqrtLowerPrice, sqrtUpper: sqrtUpperPrice,
    sqrtPrice, liquidity, reserveA, reserveB, mode,
  };
}

export function getSwapQuote(
  poolSqrtPrice: bigint,
  tickInfo: TickInfo,
  amount: bigint,
  tokenAIn: boolean,
  exactOutput: boolean,
  fee: bigint,
  protocolFeeD3: bigint,
): SwapQuote {
  const tickData: TickDataInput = {
    currentReserveA: tickInfo.reserveA,
    currentReserveB: tickInfo.reserveB,
    currentLiquidity: tickInfo.liquidity,
  };

  const result: SwapTickResult = exactOutput
    ? computeSwapExactOut(poolSqrtPrice, tickData, amount, tokenAIn, fee, protocolFeeD3, tickInfo.sqrtLower, tickInfo.sqrtUpper)
    : computeSwapExactIn(poolSqrtPrice, tickData, amount, tokenAIn, fee, protocolFeeD3, tickInfo.sqrtLower, tickInfo.sqrtUpper);

  const startPrice = (poolSqrtPrice * poolSqrtPrice) / ONE;
  const endPrice = (result.endSqrtPrice * result.endSqrtPrice) / ONE;
  const priceImpactD18 = startPrice > 0n
    ? (startPrice > endPrice
      ? ((startPrice - endPrice) * ONE) / startPrice
      : ((endPrice - startPrice) * ONE) / startPrice)
    : 0n;

  const totalFee = result.deltaInErc - mulDown(result.deltaInErc, ONE - fee);
  const protocolFee = protocolFeeD3 === 0n ? 0n : result.deltaInErc - result.deltaInBinInternal;
  const lpFee = totalFee > protocolFee ? totalFee - protocolFee : 0n;

  return {
    amountIn: result.deltaInErc,
    amountOut: result.deltaOutErc,
    totalFee,
    protocolFee,
    lpFee,
    endSqrtPrice: result.endSqrtPrice,
    endPrice,
    priceImpactD18,
    excess: result.excess,
    swappedToMaxPrice: result.swappedToMaxPrice,
  };
}

export function getMaxSwapExactIn(
  poolSqrtPrice: bigint,
  tickInfo: TickInfo,
  tokenAIn: boolean,
  feeA: bigint,
  feeB: bigint,
  protocolFeeD3: bigint,
): SwapQuote {
  const fee = feeForTickMode(tickInfo.mode, tokenAIn, feeA, feeB);
  const tickData: TickDataInput = {
    currentReserveA: tickInfo.reserveA,
    currentReserveB: tickInfo.reserveB,
    currentLiquidity: tickInfo.liquidity,
  };
  let lo = 0n;
  const maxToBin = tokenAIn
    ? (tickInfo.liquidity * (tickInfo.sqrtUpper - poolSqrtPrice)) / ONE
    : divDown(tickInfo.liquidity, tickInfo.sqrtLower) - divDown(tickInfo.liquidity, poolSqrtPrice);
  // hi must account for fee: user pays feeBasis on top of binAmount → hi ~ binAmount * ONE / (ONE - fee)
  let hi = (maxToBin * ONE) / (ONE - fee) + 1n;

  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const r = computeSwapExactIn(poolSqrtPrice, tickData, mid, tokenAIn, fee, protocolFeeD3, tickInfo.sqrtLower, tickInfo.sqrtUpper);
    if (r.excess > 0n) hi = mid - 1n;
    else lo = mid;
  }

  return getSwapQuote(poolSqrtPrice, tickInfo, lo, tokenAIn, false, fee, protocolFeeD3);
}

export function getMaxSwapExactOut(
  poolSqrtPrice: bigint,
  tickInfo: TickInfo,
  tokenAIn: boolean,
  feeA: bigint,
  feeB: bigint,
  protocolFeeD3: bigint,
): SwapQuote {
  const fee = feeForTickMode(tickInfo.mode, tokenAIn, feeA, feeB);
  const availableOutput = tokenAIn ? tickInfo.reserveB : tickInfo.reserveA;
  return getSwapQuote(poolSqrtPrice, tickInfo, availableOutput, tokenAIn, true, fee, protocolFeeD3);
}

export function getTicks(activeTick: number, radius: number): number[] {
  const ticks: number[] = [];
  for (let t = activeTick - radius; t <= activeTick + radius; t++) ticks.push(t);
  return ticks;
}

export function getActiveTickInfo(
  snapshot: { activeTick: number; poolSqrtPrice: bigint },
  config: { tickSpacing: number },
  tickState: TickState,
  mode: TickMode,
): TickInfo {
  return getTickInfo(
    snapshot.activeTick,
    config.tickSpacing,
    tickState.reserveA,
    tickState.reserveB,
    mode,
  );
}
