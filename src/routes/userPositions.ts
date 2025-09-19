import { Contract } from "ethers";
import { COMPTROLLER_ADDRESS, PRICE_ORACLE_ADDRESS } from "../config/compound";
import { provider } from "../utils/provider";
import ComptrollerAbi from "../utils/abi/Comptroller";
import ERC20Abi from "../utils/abi/ERC20";
import CTokenAbi from "../utils/abi/CToken";
import PriceOracleAbi from "../utils/abi/PriceOracle";
import { Provider as MulticallProvider, Contract as MulticallContract } from "ethcall";
import type { Env } from "../utils/env";

export async function onRequestGetUserPosition(
  context: { request: Request; env: Env }
): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);
  const user = url.searchParams.get("address");
  if (!user) return new Response(JSON.stringify({ error: "Missing address" }), { status: 400 });

  const comptroller = new Contract(COMPTROLLER_ADDRESS, ComptrollerAbi, provider);
  const cTokens: string[] = await comptroller.getAllMarkets();

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const ethcallProvider = new MulticallProvider(chainId, provider);

  const symbolCalls = cTokens.map((addr) => new MulticallContract(addr, CTokenAbi).symbol());
  const underlyingCalls = cTokens.map((addr) => new MulticallContract(addr, CTokenAbi).underlying());

  const [symbolsRaw, underlyingsRaw] = await Promise.all([
    ethcallProvider.tryAll(symbolCalls),
    ethcallProvider.tryAll(underlyingCalls),
  ]);

  const symbols = symbolsRaw as string[];
  const underlyings = underlyingsRaw.map((u, i) => (symbols[i] === "cETH" ? null : (u as string)));

  const decimalsMap: Record<string, number> = {};
  const decimalsCalls = underlyings
    .filter((u): u is string => !!u)
    .map((u) => new MulticallContract(u, ERC20Abi).decimals());

  const decimalsResults = (await ethcallProvider.tryAll(decimalsCalls)) as bigint[];

  let decimalsIndex = 0;
  for (let i = 0; i < cTokens.length; i++) {
    if (symbols[i] === "cIP") {
      decimalsMap[cTokens[i]] = 18;
    } else {
      decimalsMap[cTokens[i]] = Number(decimalsResults[decimalsIndex++]);
    }
  }

  const calls: any[] = [];
  const comptrollerContract = new MulticallContract(COMPTROLLER_ADDRESS, ComptrollerAbi);
  const oracleContract = new MulticallContract(PRICE_ORACLE_ADDRESS, PriceOracleAbi);

  for (const cTokenAddr of cTokens) {
    const cToken = new MulticallContract(cTokenAddr, CTokenAbi);
    const comptrollerContract = new MulticallContract(COMPTROLLER_ADDRESS, ComptrollerAbi);
    const oracleContract = new MulticallContract(PRICE_ORACLE_ADDRESS, PriceOracleAbi);

    calls.push(cToken.balanceOfUnderlying(user));
    calls.push(cToken.borrowBalanceStored(user));
    calls.push(comptrollerContract.checkMembership(user, cTokenAddr));
    calls.push(comptrollerContract.markets(cTokenAddr));
    calls.push(oracleContract.getUnderlyingPrice(cTokenAddr));
  }

  const response = await ethcallProvider.tryAll(calls);

  const results = [];
  for (let i = 0; i < cTokens.length; i++) {
    const symbol = symbols[i];
    const underlying = symbol === "cIP" ? "IP" : (underlyings[i] as string);
    const decimals = decimalsMap[cTokens[i]];

    const [supplyBalance, borrowBalance, isCollateral, marketData, price] = response.slice(i * 5, i * 5 + 5) as [
      bigint,
      bigint,
      boolean,
      { collateralFactorMantissa: bigint },
      bigint
    ];

    const collateralFactor = Number(marketData.collateralFactorMantissa) / 1e18;
    const supplyBalanceSafe = supplyBalance ?? 0n;
    const borrowBalanceSafe = borrowBalance ?? 0n;
    const priceSafe = price ?? 0n;

    const supplyTimesPrice = supplyBalanceSafe * priceSafe;
    const borrowTimesPrice = borrowBalanceSafe * priceSafe;

    const denom = (10n ** BigInt(decimals)) * 10n ** 18n;

    const supplyUSD = Number(supplyTimesPrice / denom);
    const borrowUSD = Number(borrowTimesPrice / denom);

    results.push({
      marketAddress: cTokens[i],
      symbol,
      underlying,
      supplyBalance: Number(supplyBalance) / 10 ** decimals,
      borrowBalance: Number(borrowBalance) / 10 ** decimals,
      healthFactor: borrowUSD > 0 ? (supplyUSD * collateralFactor) / borrowUSD : 1000,
      collateralFactor,
      isCollateral,
    });
  }

  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
}
