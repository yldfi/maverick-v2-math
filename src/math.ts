import { ONE, ONE_SQUARED, DEFAULT_DECIMALS, DEFAULT_SCALE } from './constants.js';

export function min(x: bigint, y: bigint): bigint {
  return x < y ? x : y;
}

export function max(x: bigint, y: bigint): bigint {
  return x > y ? x : y;
}

export function clip(x: bigint, y: bigint): bigint {
  return x < y ? 0n : x - y;
}

export function mulDivFloor(x: bigint, y: bigint, k: bigint): bigint {
  if (k === 0n) k = 1n;
  return (x * y) / k;
}

export function mulDivCeil(x: bigint, y: bigint, k: bigint): bigint {
  if (k === 0n) k = 1n;
  const result = (x * y) / k;
  if ((x * y) % k !== 0n) return result + 1n;
  return result;
}

export function mulFloor(x: bigint, y: bigint): bigint {
  return mulDivFloor(x, y, ONE);
}

export function mulCeil(x: bigint, y: bigint): bigint {
  return mulDivCeil(x, y, ONE);
}

export function mulDivDown(x: bigint, y: bigint, k: bigint): bigint {
  return mulDivFloor(x, y, k);
}

export function mulDivCeil2(x: bigint, y: bigint, k: bigint): bigint {
  return mulDivCeil(x, y, k);
}

export function mulDown(x: bigint, y: bigint): bigint {
  return (x * y) / ONE;
}

export function divDown(x: bigint, y: bigint): bigint {
  return (x * ONE) / y;
}

export function divUp(x: bigint, y: bigint): bigint {
  return (x * ONE + y - 1n) / y;
}

export function invFloor(x: bigint): bigint {
  return ONE_SQUARED / x;
}

export function invCeil(denominator: bigint): bigint {
  return (ONE_SQUARED - 1n) / denominator + 1n;
}

export function sqrt(x: bigint): bigint {
  if (x === 0n) return 0n;
  if (x < 2n) return x;
  let z = x / 2n + 1n;
  for (let i = 0; i < 256; i++) {
    const next = (x / z + z) >> 1n;
    if (next >= z) break;
    z = next;
  }
  return z;
}

export function mulUp(x: bigint, y: bigint): bigint {
  return mulDivCeil(x, y, ONE);
}

export function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

export function boundValue(value: bigint, lowerLimit: bigint, upperLimit: bigint): bigint {
  return max(min(value, upperLimit), lowerLimit);
}

export function scale(decimals: number): bigint {
  if (decimals === DEFAULT_DECIMALS) return DEFAULT_SCALE;
  return 10n ** BigInt(DEFAULT_DECIMALS - decimals);
}

export function ammScaleToTokenScale(amount: bigint, scaleFactor: bigint, ceil: boolean): bigint {
  if (scaleFactor === DEFAULT_SCALE || amount === 0n) return amount;
  if (!ceil) return amount / scaleFactor;
  return (amount - 1n) / scaleFactor + 1n;
}

export function tokenScaleToAmmScale(amount: bigint, scaleFactor: bigint): bigint {
  if (scaleFactor === DEFAULT_SCALE) return amount;
  return amount * scaleFactor;
}
