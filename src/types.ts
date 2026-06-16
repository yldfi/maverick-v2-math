export interface State {
  reserveA: bigint;
  reserveB: bigint;
  lastTwaD8: bigint;
  lastLogPriceD8: bigint;
  lastTimestamp: number;
  activeTick: number;
  isLocked: boolean;
  binCounter: number;
  protocolFeeRatioD3: number;
}

export type PoolState = State;

export interface TickState {
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
  binIdsByTick: number[];
}

export interface BinState {
  mergeBinBalance: bigint;
  tickBalance: bigint;
  totalSupply: bigint;
  kind: number;
  tick: number;
  mergeId: number;
}

export interface TickData {
  currentReserveA: bigint;
  currentReserveB: bigint;
  currentLiquidity: bigint;
}

export interface TickSqrtPrices {
  sqrtLowerPrice: bigint;
  sqrtUpperPrice: bigint;
}

export interface SwapParams {
  amount: bigint;
  tokenAIn: boolean;
  exactOutput: boolean;
  tickLimit: number;
}

export interface DeltaInstance {
  deltaInBinInternal: bigint;
  deltaInErc: bigint;
  deltaOutErc: bigint;
  excess: bigint;
  tokenAIn: boolean;
  exactOutput: boolean;
  swappedToMaxPrice: boolean;
  skipCombine: boolean;
  tickLimit: number;
  sqrtLowerTickPrice: bigint;
  sqrtUpperTickPrice: bigint;
  sqrtPrice: bigint;
  fractionalPart: bigint;
}

export interface SwapResult {
  amountIn: bigint;
  amountOut: bigint;
  sqrtPriceEnd: bigint;
  endTick: number;
  fractions: bigint;
}

export interface SimulatedSwap {
  amountIn: bigint;
  amountOut: bigint;
  tickDeltas: TickDelta[];
  endTick: number;
  swappedToMaxPrice: boolean;
  excess: bigint;
}

export interface TickDelta {
  tick: number;
  deltaIn: bigint;
  deltaOut: bigint;
}

export interface PoolConfig {
  tickSpacing: number;
  feeAIn: bigint;
  feeBIn: bigint;
  protocolFeeRatioD3: number;
  tokenAScale: bigint;
  tokenBScale: bigint;
  kinds: number;
}
