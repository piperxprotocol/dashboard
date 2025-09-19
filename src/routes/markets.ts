import { Contract } from "ethers";
import { COMPTROLLER_ADDRESS, PRICE_ORACLE_ADDRESS } from "../config/compound";
import { provider } from "../utils/provider";
import ComptrollerAbi from "../utils/abi/Comptroller";
import CTokenAbi from "../utils/abi/CToken";
import PriceOracleAbi from "../utils/abi/PriceOracle";
import JumpRateModelAbi from "../utils/abi/InterestRateModel";
import type { Env } from '../utils/env';
import ERC20Abi from "../utils/abi/ERC20";

export async function refreshMarketsAndCache(env: Env): Promise<any[]> {
  const comptroller = new Contract(COMPTROLLER_ADDRESS, ComptrollerAbi, provider);
  const oracle = new Contract(PRICE_ORACLE_ADDRESS, PriceOracleAbi, provider);
  const cTokens: string[] = await comptroller.getAllMarkets();
  const result: any[] = [];

  for (const cTokenAddress of cTokens) {
    const cToken = new Contract(cTokenAddress, CTokenAbi, provider);
    let symbol: string;

    console.log(cTokenAddress)

    if (cTokenAddress == '0xF5DCe57282A584D2746FaF1593d3121Fcac444dC' || '0x95b4eF2869eBD94BEb4eEE400a99824BF5DC325b' == cTokenAddress) {
      continue;
    }
    symbol = await cToken.symbol();
    console.log(symbol);

    let underlyingSymbol: string;

    if (symbol === "cIP") {
      underlyingSymbol = "cIP";
    } else {
      const underlying = await cToken.underlying();
      const underlyingToken = new Contract(underlying, ERC20Abi, provider);
      underlyingSymbol = await underlyingToken.symbol();
    }

    const [totalSupply, exchangeRateStored, totalBorrows, totalReserves, cash] = await Promise.all([
      cToken.totalSupply(),
      cToken.exchangeRateStored(),
      cToken.totalBorrows(),
      cToken.totalReserves(),
      cToken.getCash(),
    ]);

    const blocksPerYear = 2102400;
    const [supplyRatePerBlock, borrowRatePerBlock] = await Promise.all([
      cToken.supplyRatePerBlock(),
      cToken.borrowRatePerBlock(),
    ]);

    const supplyAPR = (Number(supplyRatePerBlock) / 1e18) * blocksPerYear;
    const borrowAPR = (Number(borrowRatePerBlock) / 1e18) * blocksPerYear;

    let price = 0;
    try {
      price = await oracle.getUnderlyingPrice(cTokenAddress);
    } catch (err: any) {
      console.warn(`Skipping ${symbol} (${cTokenAddress}): price oracle not configured`);
      continue;
    }
    const utilization = Number(totalBorrows) / (Number(cash) + Number(totalBorrows) - Number(totalReserves));

    const exchangeRate = Number(exchangeRateStored) / 1e18;
    const supplyUSD = Number(totalSupply) / 1e8 * exchangeRate * Number(price) / 1e18;
    const borrowUSD = Number(totalBorrows) / 1e18 * Number(price) / 1e18;
    const reservesUSD = Number(totalReserves) / 1e18 * Number(price) / 1e18;

    result.push({
      address: cTokenAddress,
      symbol,
      underlyingSymbol,
      utilization,
      supplyAPR,
      borrowAPR,
      totalSupplyUSD: supplyUSD,
      totalBorrowsUSD: borrowUSD,
      totalReservesUSD: reservesUSD,
      farmAPR: 0,
    });
  }

  await env.PIPERX_KV.put("markets", JSON.stringify(result));
  return result;
}

export async function onRequestGetMarkets(context: { env: Env }): Promise<Response> {
  const { env } = context;
  const cached = await env.PIPERX_KV.get("markets");
  if (!cached) {
    return new Response(JSON.stringify({ error: "No market data available" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(cached);
}
