import { ONE, ONE_SQUARED, ONE_D3 } from './constants.js';
import { min, clip, mulDown, divDown, divUp, mulDivDown, mulDivCeil, invFloor, invCeil } from './math.js';

export interface TickDataInput {
  currentReserveA: bigint;
  currentReserveB: bigint;
  currentLiquidity: bigint;
}

export enum TickMode {
  TOKEN_A = 0,
  TOKEN_B = 1,
  BOTH = 2,
}

export function feeForTickMode(mode: TickMode, tokenAIn: boolean, feeA: bigint, feeB: bigint): bigint {
  if (mode === TickMode.TOKEN_B) return tokenAIn ? feeB : feeA;
  return tokenAIn ? feeA : feeB;
}

export interface SwapTickResult {
  deltaInBinInternal: bigint;
  deltaInErc: bigint;
  deltaOutErc: bigint;
  excess: bigint;
  endSqrtPrice: bigint;
  swappedToMaxPrice: boolean;
}

/**
 * Matches on-chain SwapMath._amountToBinNetOfProtocolFee:
 * clip(deltaInErc, ceil(feeBasis * protocolFeeD3 / 1000))
 */
function amountToBinNetOfProtocolFee(
  deltaInErc: bigint,
  feeBasis: bigint,
  protocolFeeD3: bigint,
): bigint {
  if (protocolFeeD3 === 0n) return deltaInErc;
  return clip(deltaInErc, mulDivCeil(feeBasis, protocolFeeD3, ONE_D3));
}

/**
 * Matches on-chain SwapMath.computeSwapExactIn + computeEndPrice
 * from ParaSwap reference implementation.
 */
export function computeSwapExactIn(
  sqrtPrice: bigint,
  tickData: TickDataInput,
  amountIn: bigint,
  tokenAIn: boolean,
  fee: bigint,
  protocolFeeD3: bigint,
  sqrtLowerTickPrice: bigint,
  sqrtUpperTickPrice: bigint,
): SwapTickResult {
  const L = tickData.currentLiquidity;

  if (L === 0n || amountIn === 0n) {
    return {
      deltaInBinInternal: 0n,
      deltaInErc: 0n,
      deltaOutErc: 0n,
      excess: amountIn,
      endSqrtPrice: sqrtPrice,
      swappedToMaxPrice: false,
    };
  }

  // Step 1: Available output from this tick
  const availableOutput = tokenAIn ? tickData.currentReserveB : tickData.currentReserveA;

  // Step 2: Input needed to drain the tick
  let binAmountIn: bigint;
  if (tokenAIn) {
    binAmountIn = (L * (sqrtUpperTickPrice - sqrtPrice)) / ONE;
  } else {
    const invSqrtPrice = ONE_SQUARED / sqrtPrice;
    const invSqrtLower = ONE_SQUARED / sqrtLowerTickPrice;
    binAmountIn = clip((L * invSqrtLower) / ONE - (L * invSqrtPrice) / ONE, 0n);
  }

  // Step 3: Fee & overflow detection
  let deltaInErc: bigint;
  let feeBasis: bigint;
  let excess = 0n;
  let binAmountInFinal: bigint;

  const feeBasisDrain = mulDivCeil(binAmountIn, fee, ONE - fee);
  const deltaInErcDrain = binAmountIn + feeBasisDrain;

  if (amountIn < deltaInErcDrain) {
    // NOT draining — user can fully swap within this tick
    const userBinAmountIn = mulDown(amountIn, ONE - fee);
    binAmountInFinal = userBinAmountIn;
    deltaInErc = amountIn;
    feeBasis = deltaInErc - userBinAmountIn;
  } else {
    // Draining — user input exceeds tick capacity
    binAmountInFinal = binAmountIn;
    feeBasis = feeBasisDrain;
    deltaInErc = deltaInErcDrain;
    excess = amountIn - deltaInErcDrain;
  }

  // Step 5: Protocol fee deduction (round UP from fee portion)
  const deltaInBinInternal = amountToBinNetOfProtocolFee(deltaInErc, feeBasis, protocolFeeD3);

  // Step 6: If excess > 0, tick is fully drained
  if (excess !== 0n) {
    const endSqrtPrice = tokenAIn ? sqrtUpperTickPrice : sqrtLowerTickPrice;
    return {
      deltaInBinInternal,
      deltaInErc,
      deltaOutErc: availableOutput,
      excess,
      endSqrtPrice,
      swappedToMaxPrice: true,
    };
  }

  // Step 7: Compute end price
  let endSqrtPrice: bigint;
  if (tokenAIn) {
    endSqrtPrice = sqrtPrice + divDown(binAmountInFinal, L);
    if (endSqrtPrice > sqrtUpperTickPrice) endSqrtPrice = sqrtUpperTickPrice;
  } else {
    const inv = divDown(binAmountInFinal, L) + invFloor(sqrtPrice);
    endSqrtPrice = inv > 0n ? invFloor(inv) : sqrtLowerTickPrice;
    if (endSqrtPrice < sqrtLowerTickPrice) endSqrtPrice = sqrtLowerTickPrice;
  }

  // Step 8: Compute actual output
  // inOverL = ceil(binAmountIn / (L+1)) matches on-chain & ParaSwap
  const inOverL = divUp(binAmountInFinal, L + 1n);
  let deltaOutErc: bigint;
  if (tokenAIn) {
    // deltaOut = floor(binAmountIn * invFloor(sqrtPrice) / (inOverL + sqrtPrice))
    const inv = invFloor(sqrtPrice);
    deltaOutErc = mulDivDown(binAmountInFinal, inv, inOverL + sqrtPrice);
  } else {
    // deltaOut = floor(binAmountIn * sqrtPrice / (inOverL + invCeil(sqrtPrice)))
    const invc = invCeil(sqrtPrice);
    deltaOutErc = mulDivDown(binAmountInFinal, sqrtPrice, inOverL + invc);
  }
  deltaOutErc = min(deltaOutErc, availableOutput);

  return {
    deltaInBinInternal,
    deltaInErc,
    deltaOutErc,
    excess,
    endSqrtPrice,
    swappedToMaxPrice: endSqrtPrice === sqrtUpperTickPrice || endSqrtPrice === sqrtLowerTickPrice,
  };
}

/**
 * Matches on-chain SwapMath.computeSwapExactOut + computeEndPrice
 */
export function computeSwapExactOut(
  sqrtPrice: bigint,
  tickData: TickDataInput,
  amountOut: bigint,
  tokenAIn: boolean,
  fee: bigint,
  protocolFeeD3: bigint,
  sqrtLowerTickPrice: bigint,
  sqrtUpperTickPrice: bigint,
): SwapTickResult {
  const L = tickData.currentLiquidity;

  if (L === 0n || amountOut === 0n) {
    return {
      deltaInBinInternal: 0n,
      deltaInErc: 0n,
      deltaOutErc: 0n,
      excess: amountOut,
      endSqrtPrice: sqrtPrice,
      swappedToMaxPrice: false,
    };
  }

  // Step 1: Available output
  const amountOutAvailable = tokenAIn ? tickData.currentReserveB : tickData.currentReserveA;
  const swapped = amountOutAvailable <= amountOut;
  const deltaOut = swapped ? amountOutAvailable : amountOut;

  // Step 2: Input needed to produce desired output
  let binAmountIn: bigint;
  if (tokenAIn) {
    if (L === 0n) binAmountIn = 0n;
    else {
      const outOverL = divUp(deltaOut, L);
      binAmountIn = mulDivCeil(deltaOut, sqrtPrice, invFloor(sqrtPrice) - outOverL);
    }
  } else {
    if (L === 0n) binAmountIn = 0n;
    else {
      const outOverL = divUp(deltaOut, L);
      binAmountIn = divUp(deltaOut, mulDown(sqrtPrice, sqrtPrice - outOverL));
    }
  }

  // Step 3: Fee (always round UP for exact-out)
  const feeBasis = mulDivCeil(binAmountIn, fee, ONE - fee);
  const deltaInErc = binAmountIn + feeBasis;

  // Step 4: Protocol fee
  const deltaInBinInternal = amountToBinNetOfProtocolFee(deltaInErc, feeBasis, protocolFeeD3);

  // Step 5: Excess is leftover desired output
  const excess = swapped ? clip(amountOut, deltaOut) : 0n;

  // Step 6: End price — drained ticks go to exact boundary
  let endSqrtPrice: bigint;
  if (swapped) {
    endSqrtPrice = tokenAIn ? sqrtUpperTickPrice : sqrtLowerTickPrice;
  } else if (tokenAIn) {
    endSqrtPrice = sqrtPrice + divDown(binAmountIn, L);
    if (endSqrtPrice > sqrtUpperTickPrice) endSqrtPrice = sqrtUpperTickPrice;
  } else {
    const inv = divDown(binAmountIn, L) + invFloor(sqrtPrice);
    endSqrtPrice = inv > 0n ? invFloor(inv) : sqrtLowerTickPrice;
    if (endSqrtPrice < sqrtLowerTickPrice) endSqrtPrice = sqrtLowerTickPrice;
  }

  return {
    deltaInBinInternal,
    deltaInErc,
    deltaOutErc: deltaOut,
    excess,
    endSqrtPrice,
    swappedToMaxPrice: swapped,
  };
}
