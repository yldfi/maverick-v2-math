import type { PoolSnapshot } from '../pool.js';
import type { TickState, PoolConfig, State } from '../types.js';
import { TickMode, determineTickMode } from '../poolLens.js';

export interface RpcConfig {
  rpcUrl: string;
  poolLensAddress?: string;
}

export interface StateResponse {
  reserveA: string;
  reserveB: string;
  lastTwaD8: string;
  lastLogPriceD8: string;
  lastTimestamp: number;
  activeTick: number;
  isLocked: boolean;
  binCounter: number;
  protocolFeeRatioD3: number;
}

export interface TickResponse {
  reserveA: string;
  reserveB: string;
  totalSupply: string;
  binIdsByTick: number[];
}

export interface FeeResponse {
  feeAIn: string;
  feeBIn: string;
}

export interface BinStateResponse {
  mergeBinBalance: bigint;
  tickBalance: bigint;
  totalSupply: bigint;
  kind: number;
  tick: number;
  mergeId: number;
}

export function decodeState(response: StateResponse): State {
  return {
    reserveA: BigInt(response.reserveA),
    reserveB: BigInt(response.reserveB),
    lastTwaD8: BigInt(response.lastTwaD8),
    lastLogPriceD8: BigInt(response.lastLogPriceD8),
    lastTimestamp: response.lastTimestamp,
    activeTick: response.activeTick,
    isLocked: response.isLocked,
    binCounter: response.binCounter,
    protocolFeeRatioD3: response.protocolFeeRatioD3,
  };
}

export function decodeTick(response: TickResponse): TickState {
  return {
    reserveA: BigInt(response.reserveA),
    reserveB: BigInt(response.reserveB),
    totalSupply: BigInt(response.totalSupply),
    binIdsByTick: response.binIdsByTick,
  };
}

export function decodeBin(raw: string[]): BinStateResponse {
  return {
    mergeBinBalance: BigInt(raw[0]),
    tickBalance: BigInt(raw[1]),
    totalSupply: BigInt(raw[2]),
    kind: Number(BigInt(raw[3])),
    tick: Number(BigInt(raw[4])),
    mergeId: Number(BigInt(raw[5])),
  };
}

export async function fetchBin(rpc: RpcConfig, poolAddress: string, binId: number): Promise<BinStateResponse> {
  const data = await rpcCall(rpc, poolAddress, 'getBin(uint32)', [binId]);
  return decodeBin(data as unknown as string[]);
}

export async function fetchTickWithMode(rpc: RpcConfig, poolAddress: string, tick: number): Promise<TickState & { mode: TickMode }> {
  const data = await rpcCall(rpc, poolAddress, 'getTick(int32)', [tick]);
  const raw = data as unknown as string[];
  const binIds = [3, 4, 5, 6].map(i => Number(BigInt(raw[i]))).filter(id => id > 0);

  const binKinds: number[] = [];
  for (const binId of binIds) {
    const bin = await fetchBin(rpc, poolAddress, binId);
    binKinds.push(bin.kind);
  }

  return {
    reserveA: BigInt(raw[0]),
    reserveB: BigInt(raw[1]),
    totalSupply: BigInt(raw[2]),
    binIdsByTick: binIds,
    mode: determineTickMode(binKinds),
  };
}

export async function fetchState(rpc: RpcConfig, poolAddress: string): Promise<State> {
  const data = await rpcCall(rpc, poolAddress, 'getState()', []);
  return decodeState(data as unknown as StateResponse);
}

export async function fetchTick(rpc: RpcConfig, poolAddress: string, tick: number): Promise<TickState> {
  const data = await rpcCall(rpc, poolAddress, 'getTick(int32)', [tick]);
  return decodeTick(data as unknown as TickResponse);
}

export async function fetchFee(rpc: RpcConfig, poolAddress: string, tokenAIn: boolean): Promise<bigint> {
  const data = await rpcCall(rpc, poolAddress, 'fee(bool)', [tokenAIn]);
  return BigInt(data as string);
}

export async function fetchTickSpacing(rpc: RpcConfig, poolAddress: string): Promise<number> {
  const data = await rpcCall(rpc, poolAddress, 'tickSpacing()', []);
  return Number(data);
}

export async function fetchTokenScales(rpc: RpcConfig, poolAddress: string): Promise<{ tokenAScale: bigint; tokenBScale: bigint }> {
  const [tokenAScale, tokenBScale] = await Promise.all([
    rpcCall(rpc, poolAddress, 'tokenAScale()', []),
    rpcCall(rpc, poolAddress, 'tokenBScale()', []),
  ]);
  return {
    tokenAScale: BigInt(tokenAScale as string),
    tokenBScale: BigInt(tokenBScale as string),
  };
}

export async function fetchProtocolFeeRatio(rpc: RpcConfig, poolAddress: string): Promise<number> {
  const state = await fetchState(rpc, poolAddress);
  return state.protocolFeeRatioD3;
}

export async function fetchPoolConfig(rpc: RpcConfig, poolAddress: string): Promise<PoolConfig> {
  const [state, feeAIn, feeBIn, tickSpacingNum, scales, kinds] = await Promise.all([
    fetchState(rpc, poolAddress),
    fetchFee(rpc, poolAddress, true),
    fetchFee(rpc, poolAddress, false),
    fetchTickSpacing(rpc, poolAddress),
    fetchTokenScales(rpc, poolAddress),
    fetchKinds(rpc, poolAddress),
  ]);

  return {
    tickSpacing: tickSpacingNum,
    feeAIn,
    feeBIn,
    protocolFeeRatioD3: state.protocolFeeRatioD3,
    tokenAScale: scales.tokenAScale,
    tokenBScale: scales.tokenBScale,
    kinds,
  };
}

export async function fetchKinds(rpc: RpcConfig, poolAddress: string): Promise<number> {
  const data = await rpcCall(rpc, poolAddress, 'kinds()', []);
  return Number(data);
}

export async function fetchPoolSqrtPrice(rpc: RpcConfig, poolAddress: string): Promise<bigint> {
  const lensAddress = rpc.poolLensAddress ?? '0x6A9EB38DE5D349Fe751E0aDb4c0D9D391f94cc8D';
  const data = await rpcCall(rpc, lensAddress, 'getPoolSqrtPrice(address)', [poolAddress]);
  return BigInt(data as string);
}

export async function fetchPoolSnapshot(rpc: RpcConfig, poolAddress: string): Promise<PoolSnapshot> {
  const [state, poolSqrtPrice] = await Promise.all([
    fetchState(rpc, poolAddress),
    fetchPoolSqrtPrice(rpc, poolAddress),
  ]);
  return {
    poolSqrtPrice,
    activeTick: state.activeTick,
    reserveA: state.reserveA,
    reserveB: state.reserveB,
    protocolFeeRatioD3: state.protocolFeeRatioD3,
  };
}

export async function fetchPoolData(
  rpc: RpcConfig,
  poolAddress: string,
): Promise<{ snapshot: PoolSnapshot; config: PoolConfig }> {
  const [state, config, poolSqrtPrice] = await Promise.all([
    fetchState(rpc, poolAddress),
    fetchPoolConfig(rpc, poolAddress),
    fetchPoolSqrtPrice(rpc, poolAddress),
  ]);

  return {
    snapshot: {
      poolSqrtPrice,
      activeTick: state.activeTick,
      reserveA: state.reserveA,
      reserveB: state.reserveB,
      protocolFeeRatioD3: state.protocolFeeRatioD3,
    },
    config: {
      ...config,
      protocolFeeRatioD3: state.protocolFeeRatioD3,
    },
  };
}

export interface FullPoolState {
  snapshot: PoolSnapshot;
  config: PoolConfig;
  activeTickState: TickState & { mode: TickMode };
}

export async function fetchFullPoolState(
  rpc: RpcConfig,
  poolAddress: string,
): Promise<FullPoolState> {
  const [state, feeAIn, feeBIn, tickSpacingNum, scales, kinds, poolSqrtPrice] = await Promise.all([
    fetchState(rpc, poolAddress),
    fetchFee(rpc, poolAddress, true),
    fetchFee(rpc, poolAddress, false),
    fetchTickSpacing(rpc, poolAddress),
    fetchTokenScales(rpc, poolAddress),
    fetchKinds(rpc, poolAddress),
    fetchPoolSqrtPrice(rpc, poolAddress),
  ]);

  const activeTickWithMode = await fetchTickWithMode(rpc, poolAddress, state.activeTick);

  const config: PoolConfig = {
    tickSpacing: tickSpacingNum,
    feeAIn,
    feeBIn,
    protocolFeeRatioD3: state.protocolFeeRatioD3,
    tokenAScale: scales.tokenAScale,
    tokenBScale: scales.tokenBScale,
    kinds,
  };

  return {
    snapshot: {
      poolSqrtPrice,
      activeTick: state.activeTick,
      reserveA: state.reserveA,
      reserveB: state.reserveB,
      protocolFeeRatioD3: state.protocolFeeRatioD3,
    },
    config,
    activeTickState: activeTickWithMode,
  };
}

// Inline Keccak-256 implementation (adapted from js-sha3, MIT licensed).
// Uses 32-bit word pairs for each 64-bit lane to avoid BigInt bit-width pitfalls.
const KECCAK_RC = [1, 0, 32898, 0, 32906, 2147483648, 2147516416, 2147483648, 32907, 0, 2147483649,
  0, 2147516545, 2147483648, 32777, 2147483648, 138, 0, 136, 0, 2147516425, 0,
  2147483658, 0, 2147516555, 0, 139, 2147483648, 32905, 2147483648, 32771,
  2147483648, 32770, 2147483648, 128, 2147483648, 32778, 0, 2147483658, 2147483648,
  2147516545, 2147483648, 32896, 2147483648, 2147483649, 0, 2147516424, 2147483648];

function keccakF(s: number[]) {
  let h: number, l: number, n: number;
  let c0: number, c1: number, c2: number, c3: number, c4: number, c5: number, c6: number, c7: number, c8: number, c9: number;
  let b0: number, b1: number, b2: number, b3: number, b4: number, b5: number, b6: number, b7: number, b8: number, b9: number;
  let b10: number, b11: number, b12: number, b13: number, b14: number, b15: number, b16: number, b17: number;
  let b18: number, b19: number, b20: number, b21: number, b22: number, b23: number, b24: number, b25: number;
  let b26: number, b27: number, b28: number, b29: number, b30: number, b31: number, b32: number, b33: number;
  let b34: number, b35: number, b36: number, b37: number, b38: number, b39: number, b40: number, b41: number;
  let b42: number, b43: number, b44: number, b45: number, b46: number, b47: number, b48: number, b49: number;

  for (n = 0; n < 48; n += 2) {
    c0 = s[0] ^ s[10] ^ s[20] ^ s[30] ^ s[40];
    c1 = s[1] ^ s[11] ^ s[21] ^ s[31] ^ s[41];
    c2 = s[2] ^ s[12] ^ s[22] ^ s[32] ^ s[42];
    c3 = s[3] ^ s[13] ^ s[23] ^ s[33] ^ s[43];
    c4 = s[4] ^ s[14] ^ s[24] ^ s[34] ^ s[44];
    c5 = s[5] ^ s[15] ^ s[25] ^ s[35] ^ s[45];
    c6 = s[6] ^ s[16] ^ s[26] ^ s[36] ^ s[46];
    c7 = s[7] ^ s[17] ^ s[27] ^ s[37] ^ s[47];
    c8 = s[8] ^ s[18] ^ s[28] ^ s[38] ^ s[48];
    c9 = s[9] ^ s[19] ^ s[29] ^ s[39] ^ s[49];

    h = c8 ^ ((c2 << 1) | (c3 >>> 31));
    l = c9 ^ ((c3 << 1) | (c2 >>> 31));
    s[0] ^= h; s[1] ^= l; s[10] ^= h; s[11] ^= l; s[20] ^= h; s[21] ^= l; s[30] ^= h; s[31] ^= l; s[40] ^= h; s[41] ^= l;
    h = c0 ^ ((c4 << 1) | (c5 >>> 31));
    l = c1 ^ ((c5 << 1) | (c4 >>> 31));
    s[2] ^= h; s[3] ^= l; s[12] ^= h; s[13] ^= l; s[22] ^= h; s[23] ^= l; s[32] ^= h; s[33] ^= l; s[42] ^= h; s[43] ^= l;
    h = c2 ^ ((c6 << 1) | (c7 >>> 31));
    l = c3 ^ ((c7 << 1) | (c6 >>> 31));
    s[4] ^= h; s[5] ^= l; s[14] ^= h; s[15] ^= l; s[24] ^= h; s[25] ^= l; s[34] ^= h; s[35] ^= l; s[44] ^= h; s[45] ^= l;
    h = c4 ^ ((c8 << 1) | (c9 >>> 31));
    l = c5 ^ ((c9 << 1) | (c8 >>> 31));
    s[6] ^= h; s[7] ^= l; s[16] ^= h; s[17] ^= l; s[26] ^= h; s[27] ^= l; s[36] ^= h; s[37] ^= l; s[46] ^= h; s[47] ^= l;
    h = c6 ^ ((c0 << 1) | (c1 >>> 31));
    l = c7 ^ ((c1 << 1) | (c0 >>> 31));
    s[8] ^= h; s[9] ^= l; s[18] ^= h; s[19] ^= l; s[28] ^= h; s[29] ^= l; s[38] ^= h; s[39] ^= l; s[48] ^= h; s[49] ^= l;

    b0 = s[0]; b1 = s[1];
    b32 = (s[11] << 4) | (s[10] >>> 28); b33 = (s[10] << 4) | (s[11] >>> 28);
    b14 = (s[20] << 3) | (s[21] >>> 29); b15 = (s[21] << 3) | (s[20] >>> 29);
    b46 = (s[31] << 9) | (s[30] >>> 23); b47 = (s[30] << 9) | (s[31] >>> 23);
    b28 = (s[40] << 18) | (s[41] >>> 14); b29 = (s[41] << 18) | (s[40] >>> 14);
    b20 = (s[2] << 1) | (s[3] >>> 31); b21 = (s[3] << 1) | (s[2] >>> 31);
    b2 = (s[13] << 12) | (s[12] >>> 20); b3 = (s[12] << 12) | (s[13] >>> 20);
    b34 = (s[22] << 10) | (s[23] >>> 22); b35 = (s[23] << 10) | (s[22] >>> 22);
    b16 = (s[33] << 13) | (s[32] >>> 19); b17 = (s[32] << 13) | (s[33] >>> 19);
    b48 = (s[42] << 2) | (s[43] >>> 30); b49 = (s[43] << 2) | (s[42] >>> 30);
    b40 = (s[5] << 30) | (s[4] >>> 2); b41 = (s[4] << 30) | (s[5] >>> 2);
    b22 = (s[14] << 6) | (s[15] >>> 26); b23 = (s[15] << 6) | (s[14] >>> 26);
    b4 = (s[25] << 11) | (s[24] >>> 21); b5 = (s[24] << 11) | (s[25] >>> 21);
    b36 = (s[34] << 15) | (s[35] >>> 17); b37 = (s[35] << 15) | (s[34] >>> 17);
    b18 = (s[45] << 29) | (s[44] >>> 3); b19 = (s[44] << 29) | (s[45] >>> 3);
    b10 = (s[6] << 28) | (s[7] >>> 4); b11 = (s[7] << 28) | (s[6] >>> 4);
    b42 = (s[17] << 23) | (s[16] >>> 9); b43 = (s[16] << 23) | (s[17] >>> 9);
    b24 = (s[26] << 25) | (s[27] >>> 7); b25 = (s[27] << 25) | (s[26] >>> 7);
    b6 = (s[36] << 21) | (s[37] >>> 11); b7 = (s[37] << 21) | (s[36] >>> 11);
    b38 = (s[47] << 24) | (s[46] >>> 8); b39 = (s[46] << 24) | (s[47] >>> 8);
    b30 = (s[8] << 27) | (s[9] >>> 5); b31 = (s[9] << 27) | (s[8] >>> 5);
    b12 = (s[18] << 20) | (s[19] >>> 12); b13 = (s[19] << 20) | (s[18] >>> 12);
    b44 = (s[29] << 7) | (s[28] >>> 25); b45 = (s[28] << 7) | (s[29] >>> 25);
    b26 = (s[38] << 8) | (s[39] >>> 24); b27 = (s[39] << 8) | (s[38] >>> 24);
    b8 = (s[48] << 14) | (s[49] >>> 18); b9 = (s[49] << 14) | (s[48] >>> 18);

    s[0] = b0 ^ (~b2 & b4); s[1] = b1 ^ (~b3 & b5);
    s[10] = b10 ^ (~b12 & b14); s[11] = b11 ^ (~b13 & b15);
    s[20] = b20 ^ (~b22 & b24); s[21] = b21 ^ (~b23 & b25);
    s[30] = b30 ^ (~b32 & b34); s[31] = b31 ^ (~b33 & b35);
    s[40] = b40 ^ (~b42 & b44); s[41] = b41 ^ (~b43 & b45);
    s[2] = b2 ^ (~b4 & b6); s[3] = b3 ^ (~b5 & b7);
    s[12] = b12 ^ (~b14 & b16); s[13] = b13 ^ (~b15 & b17);
    s[22] = b22 ^ (~b24 & b26); s[23] = b23 ^ (~b25 & b27);
    s[32] = b32 ^ (~b34 & b36); s[33] = b33 ^ (~b35 & b37);
    s[42] = b42 ^ (~b44 & b46); s[43] = b43 ^ (~b45 & b47);
    s[4] = b4 ^ (~b6 & b8); s[5] = b5 ^ (~b7 & b9);
    s[14] = b14 ^ (~b16 & b18); s[15] = b15 ^ (~b17 & b19);
    s[24] = b24 ^ (~b26 & b28); s[25] = b25 ^ (~b27 & b29);
    s[34] = b34 ^ (~b36 & b38); s[35] = b35 ^ (~b37 & b39);
    s[44] = b44 ^ (~b46 & b48); s[45] = b45 ^ (~b47 & b49);
    s[6] = b6 ^ (~b8 & b0); s[7] = b7 ^ (~b9 & b1);
    s[16] = b16 ^ (~b18 & b10); s[17] = b17 ^ (~b19 & b11);
    s[26] = b26 ^ (~b28 & b20); s[27] = b27 ^ (~b29 & b21);
    s[36] = b36 ^ (~b38 & b30); s[37] = b37 ^ (~b39 & b31);
    s[46] = b46 ^ (~b48 & b40); s[47] = b47 ^ (~b49 & b41);
    s[8] = b8 ^ (~b0 & b2); s[9] = b9 ^ (~b1 & b3);
    s[18] = b18 ^ (~b10 & b12); s[19] = b19 ^ (~b11 & b13);
    s[28] = b28 ^ (~b20 & b22); s[29] = b29 ^ (~b21 & b23);
    s[38] = b38 ^ (~b30 & b32); s[39] = b39 ^ (~b31 & b33);
    s[48] = b48 ^ (~b40 & b42); s[49] = b49 ^ (~b41 & b43);

    s[0] ^= KECCAK_RC[n];
    s[1] ^= KECCAK_RC[n + 1];
  }
}

export function keccak256(message: Uint8Array): Uint8Array {
  const WORDS = 34; // 1088-bit rate / 32 bits
  const BYTES = WORDS * 4; // 136 bytes per block
  const s = new Array(50).fill(0);
  const blocks = new Array(WORDS + 1).fill(0);
  let offset = 0;

  while (offset < message.length) {
    blocks.fill(0);
    let i = 0;
    for (; offset < message.length && i < BYTES; offset++, i++) {
      blocks[i >> 2] |= message[offset] << ((i & 3) * 8);
    }
    if (i === BYTES) {
      for (let j = 0; j < WORDS; j++) s[j] ^= blocks[j];
      keccakF(s);
    } else {
      blocks[i >> 2] |= 1 << ((i & 3) * 8);
      blocks[WORDS - 1] |= 0x80000000;
      for (let j = 0; j < WORDS; j++) s[j] ^= blocks[j];
      keccakF(s);
      return digest32(s);
    }
  }

  // Empty input or input ended on a block boundary: absorb a padding-only block.
  blocks.fill(0);
  blocks[0] |= 1;
  blocks[WORDS - 1] |= 0x80000000;
  for (let j = 0; j < WORDS; j++) s[j] ^= blocks[j];
  keccakF(s);
  return digest32(s);
}

function digest32(s: number[]): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const block = s[i];
    out[i * 4] = block & 0xFF;
    out[i * 4 + 1] = (block >> 8) & 0xFF;
    out[i * 4 + 2] = (block >> 16) & 0xFF;
    out[i * 4 + 3] = (block >> 24) & 0xFF;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function selector(signature: string): string {
  return bytesToHex(keccak256(new TextEncoder().encode(signature))).slice(0, 8);
}

export interface RpcCall {
  to: string;
  data: string;
}

export function encodeFunctionCall(
  contractAddress: string,
  signature: string,
  args: unknown[],
): RpcCall {
  return {
    to: contractAddress,
    data: '0x' + selector(signature) + args.map(encodeArg).join(''),
  };
}

function encodeArg(arg: unknown): string {
  if (typeof arg === 'boolean') {
    return arg ? '0'.repeat(63) + '1' : '0'.repeat(64);
  }
  if (typeof arg === 'number' || typeof arg === 'bigint') {
    return BigInt(arg).toString(16).padStart(64, '0');
  }
  if (typeof arg === 'string' && /^0x[0-9a-fA-F]{40}$/.test(arg)) {
    return arg.slice(2).padStart(64, '0');
  }
  if (typeof arg === 'string' && /^0x[0-9a-fA-F]+$/.test(arg)) {
    return arg.slice(2).padStart(64, '0');
  }
  return '0'.repeat(64);
}

async function rpcCall(rpc: RpcConfig, to: string, signature: string, args: unknown[]): Promise<unknown> {
  const call = encodeFunctionCall(to, signature, args);

  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [call, 'latest'],
  };

  const response = await fetch(rpc.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await response.json() as { result?: string; error?: { message: string } };
  if (!json.result) throw new Error(`RPC error: ${json.error?.message ?? 'unknown'}`);

  return decodeResult(json.result, signature);
}

function decodeResult(hex: string, _signature: string): unknown {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0) return null;

  if (clean.length === 64) {
    return '0x' + clean;
  }

  if (clean.length > 64) {
    const parts: string[] = [];
    for (let i = 0; i < clean.length; i += 64) {
      parts.push('0x' + clean.slice(i, i + 64));
    }
    return parts;
  }

  return '0x' + clean;
}
