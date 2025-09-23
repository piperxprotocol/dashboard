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
    //目前先只管piperx
    const platform = 'piperx';
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

    // 最近 24h 的交易量
    const last24h = hourlyData.hourlyVolumes.filter(
      (v) => parseInt(v.timestamp) >= cutoffMicro
    );
    const volume24h = last24h.reduce((a, b) => a + parseFloat(b.volumeUSD), 0);

    // 最近 7d 和 30d
    const vols = dailyData.dailyVolumes.map((v) => parseFloat(v.volumeUSD));
    const volume7d = vols.slice(0, 7).reduce((a, b) => a + b, 0);
    const volume30d = vols.slice(0, 30).reduce((a, b) => a + b, 0);

    const result = {
      "piperx_dex": {
        "metrics": {
          "24h": volume24h,
          "7d": volume7d,
          "30d": volume30d,
        }
      },
      "storyhunt_dex": {
        "metrics": {
          "24h": 0,
          "7d": 0,
          "30d": 0,
        }
      },
      "mimboku_aggregator": {
        "metrics": {
          "24h": 0,
          "7d": 0,
          "30d": 0,
        }
      },
      "piperx_aggregator": {
        "metrics": {
          "24h": 0,
          "7d": 0,
          "30d": 0,
        }
      }
    };
    

    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default tradesRouter;
