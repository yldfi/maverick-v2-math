import { ONE, MAX_TICK } from './constants.js';
import {
  mulFloor,
  mulDown,
  mulDivDown,
  divDown,
  sqrt,
} from './math.js';

export function abs32(x: number): number {
  return x < 0 ? -x : x;
}

export function subTickIndex(tickSpacing: number, tick: number): number {
  const subTick = abs32(tick) * tickSpacing;
  if (subTick > MAX_TICK) {
    throw new Error(`TickMaxExceeded: ${tick}`);
  }
  return subTick;
}

export function tickSqrtPrice(tickSpacing: number, tick: number): bigint {
  const absTick = BigInt(Math.abs(tick) * tickSpacing);

  if (absTick > BigInt(MAX_TICK)) {
    throw new Error(`TickMaxExceeded: ${tick}`);
  }

  let ratio: bigint;
  if (absTick & 0x1n) {
    ratio = 0xfffcb933bd6fad9d3af5f0b9f25db4d6n;
  } else {
    ratio = 0x100000000000000000000000000000000n;
  }
  if (absTick & 0x2n) ratio = (ratio * 0xfff97272373d41fd789c8cb37ffcaa1cn) >> 128n;
  if (absTick & 0x4n) ratio = (ratio * 0xfff2e50f5f656ac9229c67059486f389n) >> 128n;
  if (absTick & 0x8n) ratio = (ratio * 0xffe5caca7e10e81259b3cddc7a064941n) >> 128n;
  if (absTick & 0x10n) ratio = (ratio * 0xffcb9843d60f67b19e8887e0bd251eb7n) >> 128n;
  if (absTick & 0x20n) ratio = (ratio * 0xff973b41fa98cd2e57b660be99eb2c4an) >> 128n;
  if (absTick & 0x40n) ratio = (ratio * 0xff2ea16466c9838804e327cb417cafcbn) >> 128n;
  if (absTick & 0x80n) ratio = (ratio * 0xfe5dee046a99d51e2cc356c2f617dbe0n) >> 128n;
  if (absTick & 0x100n) ratio = (ratio * 0xfcbe86c7900aecf64236ab31f1f9dcb5n) >> 128n;
  if (absTick & 0x200n) ratio = (ratio * 0xf987a7253ac4d9194200696907cf2e37n) >> 128n;
  if (absTick & 0x400n) ratio = (ratio * 0xf3392b0822b88206f8abe8a3b44dd9ben) >> 128n;
  if (absTick & 0x800n) ratio = (ratio * 0xe7159475a2c578ef4f1d17b2b235d480n) >> 128n;
  if (absTick & 0x1000n) ratio = (ratio * 0xd097f3bdfd254ee83bdd3f248e7e785en) >> 128n;
  if (absTick & 0x2000n) ratio = (ratio * 0xa9f746462d8f7dd10e744d913d033333n) >> 128n;
  if (absTick & 0x4000n) ratio = (ratio * 0x70d869a156ddd32a39e257bc3f50aa9bn) >> 128n;
  if (absTick & 0x8000n) ratio = (ratio * 0x31be135f97da6e09a19dc367e3b6da40n) >> 128n;
  if (absTick & 0x10000n) ratio = (ratio * 0x9aa508b5b7e5a9780b0cc4e25d61a56n) >> 128n;
  if (absTick & 0x20000n) ratio = (ratio * 0x5d6af8dedbcb3a6ccb7ce618d14225n) >> 128n;
  if (absTick & 0x40000n) ratio = (ratio * 0x2216e584f630389b2052b8db590en) >> 128n;

  if (tick > 0) {
    ratio = ((1n << 256n) - 1n) / ratio;
  }

  return (ratio * ONE) >> 128n;
}

export function tickSqrtPrices(
  tickSpacing: number,
  tick: number,
): { sqrtLowerPrice: bigint; sqrtUpperPrice: bigint } {
  const sqrtLowerPrice = tickSqrtPrice(tickSpacing, tick);
  const sqrtUpperPrice = tickSqrtPrice(tickSpacing, tick + 1);
  return { sqrtLowerPrice, sqrtUpperPrice };
}

export function getTickL(
  reserveA: bigint,
  reserveB: bigint,
  sqrtLowerTickPrice: bigint,
  sqrtUpperTickPrice: bigint,
): bigint {
  const diff = sqrtUpperTickPrice - sqrtLowerTickPrice;
  if (diff <= 0n) return 0n;

  let precisionBump = 0n;
  let rA = reserveA;
  let rB = reserveB;

  if ((rA >> 78n) === 0n && (rB >> 78n) === 0n) {
    precisionBump = 57n;
    rA <<= precisionBump;
    rB <<= precisionBump;
  }

  if (rB === 0n) return divDown(rA, diff) >> precisionBump;
  if (rA === 0n) return mulDivDown(mulDown(rB, sqrtLowerTickPrice), sqrtUpperTickPrice, diff) >> precisionBump;

  const b = (divDown(rA, sqrtUpperTickPrice) + mulDown(rB, sqrtLowerTickPrice)) >> 1n;

  const bSquared = (b * b) / ONE;
  const aTimesB = mulFloor(rB, rA);
  const inner = bSquared + (aTimesB * diff) / sqrtUpperTickPrice;

  const sqrtInner = sqrt(inner) * 1_000_000_000n;

  return mulDivDown(b + sqrtInner, sqrtUpperTickPrice, diff) >> precisionBump;
}

export function getSqrtPrice(
  reserveA: bigint,
  reserveB: bigint,
  sqrtLowerTickPrice: bigint,
  sqrtUpperTickPrice: bigint,
  liquidity: bigint,
): bigint {
  if (reserveA === 0n) return sqrtLowerTickPrice;
  if (reserveB === 0n) return sqrtUpperTickPrice;

  const num = reserveA + mulDown(liquidity, sqrtLowerTickPrice);
  const den = reserveB + divDown(liquidity, sqrtUpperTickPrice);

  if (den === 0n) return sqrtLowerTickPrice;

  // Matches on-chain TickMath.getSqrtPrice:
  // sqrt(ONE * (num * ONE / den)) = sqrt(num * ONE² / den)
  const sqrtPrice = sqrt(ONE * ((num * ONE) / den));

  if (sqrtPrice < sqrtLowerTickPrice) return sqrtLowerTickPrice;
  if (sqrtPrice > sqrtUpperTickPrice) return sqrtUpperTickPrice;
  return sqrtPrice;
}

export function getTickSqrtPriceAndL(
  reserveA: bigint,
  reserveB: bigint,
  sqrtLowerTickPrice: bigint,
  sqrtUpperTickPrice: bigint,
): { sqrtPrice: bigint; liquidity: bigint } {
  const liquidity = getTickL(reserveA, reserveB, sqrtLowerTickPrice, sqrtUpperTickPrice);
  const sqrtPrice = getSqrtPrice(reserveA, reserveB, sqrtLowerTickPrice, sqrtUpperTickPrice, liquidity);
  return { sqrtPrice, liquidity };
}
