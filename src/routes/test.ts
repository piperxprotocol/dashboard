import { Contract } from "ethers";
import { COMPTROLLER_ADDRESS, PRICE_ORACLE_ADDRESS } from "../config/compound";
import { provider } from "../utils/provider";
import ComptrollerAbi from "../utils/abi/Comptroller";
import ERC20Abi from "../utils/abi/ERC20";
import CTokenAbi from "../utils/abi/CToken";
import PriceOracleAbi from "../utils/abi/PriceOracle";
import type { Env } from "../utils/env";

export async function onRequestGetUserPosition(
  context: { request: Request; env: Env }
): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);
  const user = url.searchParams.get("address");
  if (!user) return new Response(JSON.stringify({ error: "Missing address" }), { status: 400 });

  const comptroller = new Contract(COMPTROLLER_ADDRESS, ComptrollerAbi, provider);
  const oracle = new Contract(PRICE_ORACLE_ADDRESS, PriceOracleAbi, provider);
  const cTokens = await comptroller.getAllMarkets();
  const results = [];

  for (const cTokenAddress of cTokens) {
    const cToken = new Contract(cTokenAddress, CTokenAbi, provider);
    const symbol = await cToken.symbol();
    let underlying;
    let decimals;

    if (symbol === "cIP") {
      underlying = "IP";
      decimals = 18;
    } else {
      underlying = await cToken.underlying();
      const token = new Contract(underlying, ERC20Abi, provider);
      decimals = await token.decimals();
      decimals = Number(decimals);
    }

    console.log("symbol " + symbol);
    console.log("underlying " + underlying);

    const [supplyBalance, borrowBalance, isCollateral] = await Promise.all([
      cToken.balanceOfUnderlying.staticCall(user),
      cToken.borrowBalanceStored(user),
      comptroller.checkMembership.staticCall(user, cTokenAddress),
    ]);



    const marketData = await comptroller.markets(cTokenAddress);
    const collateralFactor = Number(marketData.collateralFactorMantissa) / 1e18;
    let price: bigint;
    try {
      price = await oracle.getUnderlyingPrice(cTokenAddress);
      console.log(cTokenAddress + " " + price)
    } catch (e) {
      console.warn(`PriceOracle No configuration: ${symbol}(${cTokenAddress})，Use 0 as the default price`);
      price = BigInt(0);
    }
    // const price = await oracle.getUnderlyingPrice(cTokenAddress);

    const supplyTimesPrice = supplyBalance * price;    
    const borrowTimesPrice = borrowBalance * price;

    const denom = (BigInt(10) ** BigInt(decimals)) * BigInt(1e18);

    const supplyUSD = Number(supplyTimesPrice) / Number(denom);
    const borrowUSD = Number(borrowTimesPrice) / Number(denom);

    results.push({
      marketAddress: cTokenAddress,
      symbol,
      supplyBalance: Number(supplyBalance) / 10 ** decimals,
      borrowBalance: Number(borrowBalance) / 10 ** decimals,
      healthFactor: borrowUSD > 0 ? (supplyUSD * collateralFactor) / borrowUSD : 1000,
      collateralFactor,
      isCollateral,
    });
  }

  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
}
