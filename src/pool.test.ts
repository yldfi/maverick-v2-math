import { describe, it, expect } from 'vitest';
import { ONE } from './constants.js';
import { tickSqrtPrice, tickSqrtPrices, getTickL } from './tickMath.js';
import { clip } from './math.js';
import { simulateSwapExactIn, simulateSwapExactOut } from './pool.js';
import type { PoolSnapshot } from './pool.js';
import type { PoolConfig, TickState } from './types.js';
import type { TickFetcher } from './pool.js';

function drainAmount(
  reserveA: bigint, reserveB: bigint,
  sqrtLower: bigint, sqrtUpper: bigint,
  poolSqrtPrice: bigint, fee: bigint, tokenAIn: boolean, extra: bigint,
): bigint {
  const L = getTickL(reserveA, reserveB, sqrtLower, sqrtUpper);
  const binAmountIn = tokenAIn
    ? (L * (sqrtUpper - poolSqrtPrice)) / ONE
    : clip((L * (ONE * ONE / sqrtLower)) / ONE - (L * (ONE * ONE / poolSqrtPrice)) / ONE, 0n);
  const feeBasis = (binAmountIn * fee + (ONE - fee) - 1n) / (ONE - fee);
  return binAmountIn + feeBasis + extra;
}

function makeTickData(
  tick: number,
  tickSpacing: number,
  liquidity: bigint,
  poolSqrtPrice: bigint,
  reserveBBump: bigint = 0n,
): TickState {
  const { sqrtLowerPrice, sqrtUpperPrice } = tickSqrtPrices(tickSpacing, tick);
  const deltaP = sqrtUpperPrice - poolSqrtPrice > 0n ? sqrtUpperPrice - poolSqrtPrice : 0n;
  const deltaPLower = poolSqrtPrice - sqrtLowerPrice > 0n ? poolSqrtPrice - sqrtLowerPrice : 0n;
  const reserveA = (liquidity * deltaP) / ONE;
  const reserveB = (liquidity * deltaPLower) / ONE + reserveBBump;
  return { reserveA, reserveB, totalSupply: liquidity, binIdsByTick: [] };
}

describe('simulateSwapExactIn', () => {
  const tickSpacing = 1;
  const sqrt0Lower = tickSqrtPrice(tickSpacing, 0);
  const sqrt0Upper = tickSqrtPrice(tickSpacing, 1);
  const sqrt1Lower = sqrt0Upper;
  const sqrt1Upper = tickSqrtPrice(tickSpacing, 2);
  const poolSqrtPrice = sqrt0Lower + (sqrt0Upper - sqrt0Lower) / 4n;
  const L0 = 10000n * ONE;
  const L1 = 8000n * ONE;
  const fee = BigInt('3000000000000000');

  const reserveA0 = (L0 * (sqrt0Upper - poolSqrtPrice)) / ONE;
  const reserveB0 = (L0 * (poolSqrtPrice - sqrt0Lower)) / ONE;
  const reserveA1 = (L1 * (sqrt1Upper - sqrt1Lower)) / ONE;
  const reserveB1 = 1n;

  const poolSnapshot: PoolSnapshot = {
    poolSqrtPrice,
    activeTick: 0,
    reserveA: reserveA0,
    reserveB: reserveB0,
    protocolFeeRatioD3: 0,
  };

  const config: PoolConfig = {
    tickSpacing,
    feeAIn: fee,
    feeBIn: fee,
    protocolFeeRatioD3: 0,
    tokenAScale: ONE,
    tokenBScale: ONE,
    kinds: 0,
  };

  const tickMap = new Map<number, TickState>([
    [0, { reserveA: reserveA0, reserveB: reserveB0, totalSupply: L0, binIdsByTick: [] }],
    [1, { reserveA: reserveA1, reserveB: reserveB1, totalSupply: L1, binIdsByTick: [] }],
    [-1, makeTickData(-1, tickSpacing, 6000n * ONE, poolSqrtPrice, 1n)],
  ]);
  const getTick: TickFetcher = (t) => tickMap.get(t) ?? null;

  it('non-draining amount stays in single tick (A→B)', () => {
    const binAmountIn = (L0 * (sqrt0Upper - poolSqrtPrice)) / ONE;
    const smallIn = binAmountIn / 2n;
    const result = simulateSwapExactIn(poolSnapshot, config, getTick, smallIn, true);
    expect(result.amountOut).toBeGreaterThan(0n);
    expect(result.amountIn).toBe(smallIn);
    expect(result.tickDeltas.length).toBe(1);
    expect(result.tickDeltas[0].tick).toBe(0);
    expect(result.endTick).toBe(0);
  });

  it('non-draining amount stays in single tick (B→A)', () => {
    const sqrtLower = tickSqrtPrice(tickSpacing, 0);
    const invPrice = (ONE * ONE) / poolSqrtPrice;
    const invLower = (ONE * ONE) / sqrtLower;
    const binAmountIn = clip((L0 * invLower) / ONE - (L0 * invPrice) / ONE, 0n);
    const smallIn = binAmountIn / 2n;
    const result = simulateSwapExactIn(poolSnapshot, config, getTick, smallIn, false);
    expect(result.amountOut).toBeGreaterThan(0n);
    expect(result.tickDeltas.length).toBe(1);
    expect(result.tickDeltas[0].tick).toBe(0);
    expect(result.endTick).toBe(0);
  });

  it('drains tick 0 and continues to tick 1 (A→B)', () => {
    const amountToDrain = drainAmount(reserveA0, reserveB0, sqrt0Lower, sqrt0Upper, poolSqrtPrice, fee, true, 1000n);

    const result = simulateSwapExactIn(poolSnapshot, config, getTick, amountToDrain, true);
    expect(result.tickDeltas.length).toBe(2);
    expect(result.tickDeltas[0].tick).toBe(0);
    expect(result.tickDeltas[1].tick).toBe(1);
    expect(result.amountOut).toBeGreaterThan(reserveB0);
    expect(result.endTick).toBe(1);
  });

  it('drains tick 0 and continues to tick -1 (B→A)', () => {
    const sqrtMinus1Lower = tickSqrtPrice(tickSpacing, -1);
    const sqrtMinus1Upper = tickSqrtPrice(tickSpacing, 0);
    const LMinus1 = 6000n * ONE;
    const reserveAMinus1 = 1n;
    const reserveBMinus1 = (LMinus1 * (sqrtMinus1Upper - sqrtMinus1Lower)) / ONE;

    const baTickMap = new Map<number, TickState>([
      [0, { reserveA: reserveA0, reserveB: reserveB0, totalSupply: L0, binIdsByTick: [] }],
      [-1, { reserveA: reserveAMinus1, reserveB: reserveBMinus1, totalSupply: LMinus1, binIdsByTick: [] }],
    ]);
    const getTickBA: TickFetcher = (t) => baTickMap.get(t) ?? null;

    const amountToDrain = drainAmount(reserveA0, reserveB0, sqrt0Lower, sqrt0Upper, poolSqrtPrice, fee, false, 1000n);

    const result = simulateSwapExactIn(poolSnapshot, config, getTickBA, amountToDrain, false);
    expect(result.tickDeltas.length).toBe(2);
    expect(result.tickDeltas[0].tick).toBe(0);
    expect(result.tickDeltas[1].tick).toBe(-1);
    expect(result.amountOut).toBeGreaterThan(reserveA0);
    expect(result.endTick).toBe(-1);
  });

  it('zero amount returns zero output', () => {
    const result = simulateSwapExactIn(poolSnapshot, config, getTick, 0n, true);
    expect(result.amountOut).toBe(0n);
    expect(result.amountIn).toBe(0n);
    expect(result.tickDeltas.length).toBe(0);
  });

  it('respects tick limit (stops before tick 1)', () => {
    const amountToDrain = drainAmount(reserveA0, reserveB0, sqrt0Lower, sqrt0Upper, poolSqrtPrice, fee, true, 1n);

    const result = simulateSwapExactIn(poolSnapshot, config, getTick, amountToDrain, true, 0);
    expect(result.tickDeltas.length).toBe(1);
    expect(result.tickDeltas[0].tick).toBe(0);
  });

  it('zero-liquidity tick is skipped', () => {
    const tickMapWithZero = new Map<number, TickState>([
      [0, { reserveA: reserveA0, reserveB: reserveB0, totalSupply: L0, binIdsByTick: [] }],
      [1, { reserveA: 0n, reserveB: 0n, totalSupply: 0n, binIdsByTick: [] }],
    ]);
    const getTickZero: TickFetcher = (t) => tickMapWithZero.get(t) ?? null;

    const amountToDrain = drainAmount(reserveA0, reserveB0, sqrt0Lower, sqrt0Upper, poolSqrtPrice, fee, true, 10n);

    const result = simulateSwapExactIn(poolSnapshot, config, getTickZero, amountToDrain, true);
    expect(result.tickDeltas.length).toBe(1);
    expect(result.tickDeltas[0].tick).toBe(0);
    expect(result.amountOut).toBe(reserveB0);
  });

  it('crosses an empty tick gap before consuming deeper liquidity (B→A)', () => {
    const sqrtMinus2Lower = tickSqrtPrice(tickSpacing, -2);
    const sqrtMinus2Upper = tickSqrtPrice(tickSpacing, -1);
    const LMinus2 = 6000n * ONE;
    const reserveAMinus2 = 100n * ONE;
    const reserveBMinus2 =
      (LMinus2 * (sqrtMinus2Upper - sqrtMinus2Lower)) / ONE;
    const getTickAcrossGap: TickFetcher = (tick) => {
      if (tick === 0) {
        return {
          reserveA: reserveA0,
          reserveB: reserveB0,
          totalSupply: L0,
          binIdsByTick: [],
        };
      }
      if (tick === -2) {
        return {
          reserveA: reserveAMinus2,
          reserveB: reserveBMinus2,
          totalSupply: LMinus2,
          binIdsByTick: [],
        };
      }
      return null;
    };
    const amountToDrain = drainAmount(
      reserveA0,
      reserveB0,
      sqrt0Lower,
      sqrt0Upper,
      poolSqrtPrice,
      fee,
      false,
      1000n,
    );

    const result = simulateSwapExactIn(
      poolSnapshot,
      config,
      getTickAcrossGap,
      amountToDrain,
      false,
    );

    expect(result.tickDeltas.map(({ tick }) => tick)).toEqual([0, -2]);
    expect(result.amountOut).toBeGreaterThan(reserveA0);
    expect(result.excess).toBe(0n);
  });
});

describe('simulateSwapExactOut', () => {
  const tickSpacing = 1;
  const sqrt0Lower = tickSqrtPrice(tickSpacing, 0);
  const sqrt0Upper = tickSqrtPrice(tickSpacing, 1);
  const poolSqrtPrice = sqrt0Lower + (sqrt0Upper - sqrt0Lower) / 4n;
  const L0 = 10000n * ONE;
  const fee = BigInt('3000000000000000');

  const reserveA0 = (L0 * (sqrt0Upper - poolSqrtPrice)) / ONE;
  const reserveB0 = (L0 * (poolSqrtPrice - sqrt0Lower)) / ONE;

  const poolSnapshot: PoolSnapshot = {
    poolSqrtPrice,
    activeTick: 0,
    reserveA: reserveA0,
    reserveB: reserveB0,
    protocolFeeRatioD3: 0,
  };

  const config: PoolConfig = {
    tickSpacing,
    feeAIn: fee,
    feeBIn: fee,
    protocolFeeRatioD3: 0,
    tokenAScale: ONE,
    tokenBScale: ONE,
    kinds: 0,
  };

  const tickMap = new Map<number, TickState>([
    [0, { reserveA: reserveA0, reserveB: reserveB0, totalSupply: L0, binIdsByTick: [] }],
  ]);
  const getTick: TickFetcher = (t) => tickMap.get(t) ?? null;

  it('returns input for a single tick', () => {
    const outAmount = reserveB0 / 2n;
    const result = simulateSwapExactOut(poolSnapshot, config, getTick, outAmount, true);
    expect(result.amountOut).toBe(outAmount);
    expect(result.amountIn).toBeGreaterThan(0n);
    expect(result.tickDeltas.length).toBe(1);
    expect(result.tickDeltas[0].tick).toBe(0);
    expect(result.endTick).toBe(0);
  });

  it('single tick B→A', () => {
    const outAmount = reserveA0 / 2n;
    const result = simulateSwapExactOut(poolSnapshot, config, getTick, outAmount, false);
    expect(result.amountOut).toBe(outAmount);
    expect(result.amountIn).toBeGreaterThan(0n);
    expect(result.tickDeltas.length).toBe(1);
    expect(result.tickDeltas[0].tick).toBe(0);
  });

  it('returns all available output when amount exceeds reserves', () => {
    const result = simulateSwapExactOut(poolSnapshot, config, getTick, reserveB0 * 10n, true);
    expect(result.amountOut).toBe(reserveB0);
    expect(result.amountIn).toBeGreaterThan(0n);
  });

  it('zero amount returns no swap', () => {
    const result = simulateSwapExactOut(poolSnapshot, config, getTick, 0n, true);
    expect(result.amountOut).toBe(0n);
    expect(result.amountIn).toBe(0n);
    expect(result.tickDeltas.length).toBe(0);
  });

  it('drains tick 0 and continues to tick 1 (A→B)', () => {
    const sqrt1Lower = sqrt0Upper;
    const sqrt1Upper = tickSqrtPrice(tickSpacing, 2);
    const L1 = 8000n * ONE;
    const reserveA1 = (L1 * (sqrt1Upper - sqrt1Lower)) / ONE;
    const reserveB1 = ONE;

    const multiTickMap = new Map<number, TickState>([
      [0, { reserveA: reserveA0, reserveB: reserveB0, totalSupply: L0, binIdsByTick: [] }],
      [1, { reserveA: reserveA1, reserveB: reserveB1, totalSupply: L1, binIdsByTick: [] }],
    ]);
    const getTickMulti: TickFetcher = (t) => multiTickMap.get(t) ?? null;

    const amountOut = reserveB0 + 1n;
    const result = simulateSwapExactOut(poolSnapshot, config, getTickMulti, amountOut, true);
    expect(result.amountOut).toBe(amountOut);
    expect(result.tickDeltas.length).toBe(2);
    expect(result.tickDeltas[0].tick).toBe(0);
    expect(result.tickDeltas[1].tick).toBe(1);
    expect(result.endTick).toBe(1);
  });

  it('drains tick 0 and continues to tick -1 (B→A)', () => {
    const sqrtMinus1Lower = tickSqrtPrice(tickSpacing, -1);
    const sqrtMinus1Upper = tickSqrtPrice(tickSpacing, 0);
    const LMinus1 = 6000n * ONE;
    const reserveAMinus1 = ONE;
    const reserveBMinus1 = (LMinus1 * (sqrtMinus1Upper - sqrtMinus1Lower)) / ONE;

    const multiTickMap = new Map<number, TickState>([
      [0, { reserveA: reserveA0, reserveB: reserveB0, totalSupply: L0, binIdsByTick: [] }],
      [-1, { reserveA: reserveAMinus1, reserveB: reserveBMinus1, totalSupply: LMinus1, binIdsByTick: [] }],
    ]);
    const getTickMulti: TickFetcher = (t) => multiTickMap.get(t) ?? null;

    const amountOut = reserveA0 + 1n;
    const result = simulateSwapExactOut(poolSnapshot, config, getTickMulti, amountOut, false);
    expect(result.amountOut).toBe(amountOut);
    expect(result.tickDeltas.length).toBe(2);
    expect(result.tickDeltas[0].tick).toBe(0);
    expect(result.tickDeltas[1].tick).toBe(-1);
    expect(result.endTick).toBe(-1);
  });

  it('crosses an empty tick gap before consuming deeper liquidity (B→A)', () => {
    const sqrtMinus2Lower = tickSqrtPrice(tickSpacing, -2);
    const sqrtMinus2Upper = tickSqrtPrice(tickSpacing, -1);
    const LMinus2 = 6000n * ONE;
    const reserveAMinus2 = 100n * ONE;
    const reserveBMinus2 =
      (LMinus2 * (sqrtMinus2Upper - sqrtMinus2Lower)) / ONE;
    const gapMap = new Map<number, TickState>([
      [
        0,
        {
          reserveA: reserveA0,
          reserveB: reserveB0,
          totalSupply: L0,
          binIdsByTick: [],
        },
      ],
      [
        -2,
        {
          reserveA: reserveAMinus2,
          reserveB: reserveBMinus2,
          totalSupply: LMinus2,
          binIdsByTick: [],
        },
      ],
    ]);

    const result = simulateSwapExactOut(
      poolSnapshot,
      config,
      (tick) => gapMap.get(tick) ?? null,
      reserveA0 + 1n,
      false,
    );

    expect(result.tickDeltas.map(({ tick }) => tick)).toEqual([0, -2]);
    expect(result.amountOut).toBe(reserveA0 + 1n);
    expect(result.excess).toBe(0n);
  });
});

describe('block 25535942 movement-bin gap regression', () => {
  const pool: PoolSnapshot = {
    poolSqrtPrice: 1537228310291990367n,
    activeTick: 172,
    reserveA: 26816174501757401528987n,
    reserveB: 5278284941046842543979n,
    protocolFeeRatioD3: 0,
  };
  const config: PoolConfig = {
    tickSpacing: 50,
    feeAIn: 2000000000000000n,
    feeBIn: 1000000000000000n,
    protocolFeeRatioD3: 0,
    tokenAScale: 1n,
    tokenBScale: 1n,
    kinds: 15,
  };
  const ticks = new Map<number, TickState>([
    [
      156,
      {
        reserveA: 25886246004570669164213n,
        reserveB: 0n,
        totalSupply: 17066534153794224085290n,
        binIdsByTick: [14],
      },
    ],
    [
      172,
      {
        reserveA: 2832387545629078612n,
        reserveB: 1198301907250354964852n,
        totalSupply: 1848513144769664888600n,
        binIdsByTick: [30],
      },
    ],
  ]);

  it.each([
    [100000000000000000000n, 219212996698589350629n],
    [250000000000000000000n, 547708162185547002222n],
    [3280256491728931913728n, 7179417142452204409291n],
    [5000000000000000000000n, 10939299208604763180505n],
  ])(
    'matches the official quoter across the empty ticks for %s wei input',
    (amountIn, expectedAmountOut) => {
      const result = simulateSwapExactIn(
        pool,
        config,
        (tick) => ticks.get(tick) ?? null,
        amountIn,
        false,
      );

      expect(result.amountIn).toBe(amountIn);
      const outputDiff =
        result.amountOut > expectedAmountOut
          ? result.amountOut - expectedAmountOut
          : expectedAmountOut - result.amountOut;
      expect(outputDiff).toBeLessThanOrEqual(1_000_000n);
      expect(result.tickDeltas.map(({ tick }) => tick)).toEqual([172, 156]);
      expect(result.endTick).toBe(156);
      expect(result.excess).toBe(0n);
    },
  );
});
