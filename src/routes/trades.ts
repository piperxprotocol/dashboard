import { Hono } from 'hono';
import { querySubgraph } from '../services/subgraph';
import poolsConfig from "../config/liquidityPools.json";

const tradesRouter = new Hono();

const GET_DAILY_VOLUME = `
  query GetPairsVolumeAggregateDaily($pairIds: [String!]!) {
    dailyVolumes: tokenPairVolumeAggregates(
      first: 365
      interval: day
      where: { pair_: { id_in: $pairIds } }
      orderBy: timestamp
      orderDirection: desc
    ) {
      timestamp
      volumeUSD
      volumeNative
      pair {
        id
        token0 { id symbol }
        token1 { id symbol }
      }
    }
  }
`;

const GET_HOURLY_VOLUME = `
  query GetPairsVolumeAggregate($pairIds: [String!]!, $hourlyLimit: Int!) {
    hourlyVolumes: tokenPairVolumeAggregates(
      first: $hourlyLimit
      interval: hour
      where: { pair_: { id_in: $pairIds } }
      orderBy: timestamp
      orderDirection: desc
    ) {
      timestamp
      volumeUSD
      volumeNative
      pair {
        id
        token0 { id symbol }
        token1 { id symbol }
      }
    }
  }
`;

type DailyVolumeResponse = {
  dailyVolumes: {
    timestamp: string;
    volumeUSD: string;
    volumeNative: string;
    pair: { id: string; token0: { id: string; symbol: string }; token1: { id: string; symbol: string } };
  }[];
};

type HourlyVolumeResponse = {
  hourlyVolumes: {
    timestamp: string;
    volumeUSD: string;
    volumeNative: string;
    pair: { id: string };
  }[];
};

tradesRouter.get('/metrics', async (c) => {
  try {
    const platform = (c.req.query('platform') || 'piperx') as 'piperx' | 'storyhunt';
    const pairIds = c.req.query('pairIds');

    let ids: string[];
    if (pairIds) {
      ids = pairIds.split(',').map((id) => id.toLowerCase());
    } else {
      ids = Object.entries(poolsConfig)
        .filter(([_, value]: [string, any]) => value.isExist)
        .map(([_, value]: [string, any]) => value.poolAddress.toLowerCase());
    }

    console.log("Using pool IDs:", ids);

    const dailyData = await querySubgraph<DailyVolumeResponse>(
      platform,
      GET_DAILY_VOLUME,
      { pairIds: ids }
    );

    const hourlyData = await querySubgraph<HourlyVolumeResponse>(
      platform,
      GET_HOURLY_VOLUME,
      { pairIds: ids, hourlyLimit: 1000 }
    );

    const nowMicro = Date.now() * 1000; 
    const cutoffMicro = nowMicro - 24 * 60 * 60 * 1_000_000; 

    const grouped: Record<
      string,
      {
        token0: { id: string; symbol: string };
        token1: { id: string; symbol: string };
        volume24h: number;
        volume7d: number;
        volume14d: number;
        // daily: { timestamp: number; volumeUSD: number; volumeNative: number }[];
      }
    > = {};

    ids.forEach((id) => {
      const vols = dailyData.dailyVolumes
        .filter((v) => v.pair.id.toLowerCase() === id)
        .map((v) => ({
          timestamp: parseInt(v.timestamp),
          volumeUSD: parseFloat(v.volumeUSD),
          volumeNative: parseFloat(v.volumeNative),
        }));

      const hourlyVols = hourlyData.hourlyVolumes
        .filter((v) => v.pair.id.toLowerCase() === id)
        .map((v) => ({
          timestamp: parseInt(v.timestamp),
          volumeUSD: parseFloat(v.volumeUSD),
          volumeNative: parseFloat(v.volumeNative),
        }));

      const last24h = hourlyVols.filter((v) => v.timestamp >= cutoffMicro);
      const volume24h = last24h.reduce((a, b) => a + b.volumeUSD, 0);

      grouped[id] = {
        token0: {
          id: dailyData.dailyVolumes.find((v) => v.pair.id.toLowerCase() === id)?.pair.token0.id ?? "",
          symbol: dailyData.dailyVolumes.find((v) => v.pair.id.toLowerCase() === id)?.pair.token0.symbol ?? "",
        },
        token1: {
          id: dailyData.dailyVolumes.find((v) => v.pair.id.toLowerCase() === id)?.pair.token1.id ?? "",
          symbol: dailyData.dailyVolumes.find((v) => v.pair.id.toLowerCase() === id)?.pair.token1.symbol ?? "",
        },
        volume24h,
        volume7d: vols.slice(0, 7).reduce((a, b) => a + b.volumeUSD, 0),
        volume14d: vols.slice(0, 30).reduce((a, b) => a + b.volumeUSD, 0),
        // daily: vols,
      };
    });

    return c.json({ platform, pools: grouped });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default tradesRouter;
