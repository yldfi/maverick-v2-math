import { describe, it, expect } from 'vitest';
import { mulDivFloor, mulFloor, divDown, sqrt, clip } from './math.js';
import { ONE } from './constants.js';
import { tickSqrtPrice, tickSqrtPrices, getTickSqrtPriceAndL } from './tickMath.js';
import { computeSwapExactIn, computeSwapExactOut } from './swapMath.js';

describe('Math utilities', () => {
  it('mulDivFloor', () => {
    expect(mulDivFloor(10n, 10n, 2n)).toBe(50n);
    expect(mulDivFloor(10n, 10n, ONE)).toBe(0n);
    expect(mulDivFloor(ONE, ONE, ONE)).toBe(ONE);
  });

  it('mulFloor', () => {
    expect(mulFloor(ONE, ONE)).toBe(ONE);
    expect(mulFloor(ONE * 2n, ONE * 2n)).toBe(ONE * 4n);
    expect(mulFloor(ONE, 0n)).toBe(0n);
  });

  it('divDown', () => {
    expect(divDown(ONE, ONE)).toBe(ONE);
    expect(divDown(ONE, ONE * 2n)).toBe(ONE / 2n);
  });

  it('sqrt', () => {
    expect(sqrt(0n)).toBe(0n);
    expect(sqrt(ONE * ONE)).toBe(ONE);
    expect(sqrt(ONE * ONE * 4n)).toBe(ONE * 2n);
    expect(sqrt(ONE * ONE * 100n)).toBe(ONE * 10n);
  });

  it('clip', () => {
    expect(clip(10n, 5n)).toBe(5n);
    expect(clip(5n, 10n)).toBe(0n);
    expect(clip(0n, 0n)).toBe(0n);
  });
});

describe('TickMath', () => {
  it('tickSqrtPrice at tick 0', () => {
    const price = tickSqrtPrice(10, 0);
    expect(price).toBe(ONE);
  });

  it('tickSqrtPrice at positive tick', () => {
    const price = tickSqrtPrice(10, 10);
    expect(price).toBeGreaterThan(ONE);

    const price2 = tickSqrtPrice(1, 1);
    expect(price2).toBeGreaterThan(ONE);
  });

  it('tickSqrtPrice at negative tick', () => {
    const price = tickSqrtPrice(10, -10);
    expect(price).toBeLessThan(ONE);
  });

  it('tickSqrtPrices returns lower < upper', () => {
    const { sqrtLowerPrice, sqrtUpperPrice } = tickSqrtPrices(10, 0);
    expect(sqrtLowerPrice).toBeLessThan(sqrtUpperPrice);
    expect(sqrtLowerPrice).toBe(tickSqrtPrice(10, 0));
    expect(sqrtUpperPrice).toBe(tickSqrtPrice(10, 1));
  });

  it('tickSqrtPrice symmetry (neg == reciprocal)', () => {
    const posPrice = tickSqrtPrice(10, 100);
    const negPrice = tickSqrtPrice(10, -100);
    const product = (posPrice * negPrice) / ONE;
    const diff = product > ONE ? product - ONE : ONE - product;
    expect(diff).toBeLessThan(10n);
  });
});

describe('getTickSqrtPriceAndL', () => {
  it('single-asset tick (only A → price at upper boundary)', () => {
    const tickSpacing = 10;
    const tick = -10;
    const { sqrtLowerPrice, sqrtUpperPrice } = tickSqrtPrices(tickSpacing, tick);

    const reserveA = 100n * ONE;
    const reserveB = 0n;

    const { sqrtPrice, liquidity } = getTickSqrtPriceAndL(reserveA, reserveB, sqrtLowerPrice, sqrtUpperPrice);
    expect(liquidity).toBeGreaterThan(0n);
    expect(sqrtPrice).toBe(sqrtUpperPrice);
  });

  it('single-asset tick (only B → price at lower boundary)', () => {
    const tickSpacing = 10;
    const tick = 10;
    const { sqrtLowerPrice, sqrtUpperPrice } = tickSqrtPrices(tickSpacing, tick);

    const reserveA = 0n;
    const reserveB = 100n * ONE;

    const { sqrtPrice, liquidity } = getTickSqrtPriceAndL(reserveA, reserveB, sqrtLowerPrice, sqrtUpperPrice);
    expect(liquidity).toBeGreaterThan(0n);
    expect(sqrtPrice).toBe(sqrtLowerPrice);
  });
});

describe('computeSwapExactIn', () => {
  const tickSpacing = 10;
  const sqrtLowerPrice = tickSqrtPrice(tickSpacing, 0);
  const sqrtUpperPrice = tickSqrtPrice(tickSpacing, 1);
  const sqrtPrice = sqrtLowerPrice + (sqrtUpperPrice - sqrtLowerPrice) / 4n;
  const liquidity = 10000n * ONE;
  const amountIn = ONE;
  const fee = BigInt('3000000000000000'); // 0.3%

  it('swap A in: increases sqrtPrice, returns output', () => {
    const deltaP = sqrtUpperPrice - sqrtPrice;
    const reserveA = (liquidity * deltaP) / ONE;
    const reserveB = (liquidity * (sqrtPrice - sqrtLowerPrice)) / ONE;
    const result = computeSwapExactIn(
      sqrtPrice,
      { currentReserveA: reserveA, currentReserveB: reserveB, currentLiquidity: liquidity },
      amountIn,
      true,
      fee,
      0n,
      sqrtLowerPrice,
      sqrtUpperPrice,
    );

    expect(result.deltaInErc).toBe(amountIn);
    expect(result.deltaOutErc).toBeGreaterThan(0n);
    expect(result.endSqrtPrice).toBeGreaterThan(sqrtPrice);
  });

  it('swap B in: decreases sqrtPrice, returns output', () => {
    const deltaP = sqrtUpperPrice - sqrtPrice;
    const reserveA = (liquidity * deltaP) / ONE;
    const reserveB = (liquidity * (sqrtPrice - sqrtLowerPrice)) / ONE;
    const result = computeSwapExactIn(
      sqrtPrice,
      { currentReserveA: reserveA, currentReserveB: reserveB, currentLiquidity: liquidity },
      amountIn,
      false,
      fee,
      0n,
      sqrtLowerPrice,
      sqrtUpperPrice,
    );

    expect(result.deltaInErc).toBe(amountIn);
    expect(result.deltaOutErc).toBeGreaterThan(0n);
    expect(result.endSqrtPrice).toBeLessThan(sqrtPrice);
  });

  it('exact-out A in: returns input estimate', () => {
    // reserves must match liquidity: reserveA = L * (sqrtUpper - sqrtP) / ONE
    const deltaP = sqrtUpperPrice - sqrtPrice;
    const reserveA = (liquidity * deltaP) / ONE;
    const reserveB = (liquidity * (sqrtPrice - sqrtLowerPrice)) / ONE;
    const result = computeSwapExactOut(
      sqrtPrice,
      { currentReserveA: reserveA, currentReserveB: reserveB, currentLiquidity: liquidity },
      reserveB / 2n, // output half the available reserve B
      true,
      fee,
      0n,
      sqrtLowerPrice,
      sqrtUpperPrice,
    );

    expect(result.deltaOutErc).toBeGreaterThan(0n);
    expect(result.deltaInErc).toBeGreaterThan(0n);
    expect(result.endSqrtPrice).toBeGreaterThan(sqrtPrice);
  });

  it('exact-out B in: returns input estimate', () => {
    const deltaP = sqrtUpperPrice - sqrtPrice;
    const reserveA = (liquidity * deltaP) / ONE;
    const reserveB = (liquidity * (sqrtPrice - sqrtLowerPrice)) / ONE;
    const result = computeSwapExactOut(
      sqrtPrice,
      { currentReserveA: reserveA, currentReserveB: reserveB, currentLiquidity: liquidity },
      reserveA / 2n, // output half the available reserve A
      false,
      fee,
      0n,
      sqrtLowerPrice,
      sqrtUpperPrice,
    );

    expect(result.deltaOutErc).toBeGreaterThan(0n);
    expect(result.deltaInErc).toBeGreaterThan(0n);
    expect(result.endSqrtPrice).toBeLessThan(sqrtPrice);
  });

  it('swap A in: zero liquidity returns zero output', () => {
    const result = computeSwapExactIn(
      sqrtLowerPrice,
      { currentReserveA: 0n, currentReserveB: 0n, currentLiquidity: 0n },
      amountIn,
      true,
      fee,
      0n,
      sqrtLowerPrice,
      sqrtUpperPrice,
    );

    expect(result.deltaOutErc).toBe(0n);
    expect(result.excess).toBe(amountIn);
  });
});
