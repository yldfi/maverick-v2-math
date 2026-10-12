// maverick-v2-math: math helpers, tick prices and swap computation, published vs local build.
import { runMathCompat } from "./math-runner.mjs";

await runMathCompat((r, n, run) => {
  const x = r(0n, 10n ** 30n), y = r(1n, 10n ** 30n), k = r(1n, 10n ** 24n);
  const spacing = Number(r(1n, 200n)), tick = Number(r(-2000n, 2000n));
  const resA = r(0n, 10n ** 24n), resB = r(0n, 10n ** 24n);
  const amount = r(1n, 10n ** 22n), fee = r(0n, 10n ** 16n), protocolFee = r(0n, 255n), aIn = n % 2 === 0;
  return (m) => {
    const lo = run(() => m.tickSqrtPrice(spacing, tick));
    const hi = run(() => m.tickSqrtPrice(spacing, tick + 1));
    let L = "skip", sqrtPrice = "skip", swapIn = "skip", swapOut = "skip";
    if (!lo.startsWith("THROW") && !hi.startsWith("THROW")) {
      const sl = BigInt(JSON.parse(lo)), su = BigInt(JSON.parse(hi));
      L = run(() => m.getTickL(resA, resB, sl, su));
      if (!L.startsWith("THROW")) {
        const liquidity = BigInt(JSON.parse(L));
        sqrtPrice = run(() => m.getSqrtPrice(resA, resB, sl, su, liquidity));
        if (!sqrtPrice.startsWith("THROW")) {
          const s = BigInt(JSON.parse(sqrtPrice));
          const tickData = { currentReserveA: resA, currentReserveB: resB, currentLiquidity: liquidity };
          swapIn = run(() => m.computeSwapExactIn(s, tickData, amount, aIn, fee, protocolFee, sl, su));
          swapOut = run(() => m.computeSwapExactOut(s, tickData, amount / 1000n + 1n, aIn, fee, protocolFee, sl, su));
        }
      }
    }
    return {
      mulDown: run(() => m.mulDown(x, y)),
      mulDivDown: run(() => m.mulDivDown(x, y, k)),
      mulDivCeil: run(() => m.mulDivCeil(x, y, k)),
      divDown: run(() => m.divDown(x, y)),
      divUp: run(() => m.divUp(x, y)),
      sqrt: run(() => m.sqrt(x)),
      tickSqrtPriceLower: lo,
      tickSqrtPriceUpper: hi,
      getTickL: L,
      getSqrtPrice: sqrtPrice,
      computeSwapExactIn: swapIn,
      computeSwapExactOut: swapOut,
      feeForTickMode: run(() => m.feeForTickMode(n % 3, aIn, fee, fee * 2n)),
    };
  };
}, { seed: 987654321n });
