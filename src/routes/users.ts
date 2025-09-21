import { Hono } from 'hono';
import { querySubgraph } from '../services/subgraph';
import poolsConfig from "../config/liquidityPools.json";

const userStatsRouter = new Hono();

const GET_TOKEN_SWAPS = `
  query GetTokenSwapsInTimeRange(
    $pairIds: [String!]!, 
    $startTime: String!, 
    $endTime: String!, 
    $limit: Int!, 
    $skip: Int!
  ) {
    tokenSwaps(
      first: $limit
      skip: $skip
      where: {
        pair_: { id_in: $pairIds }
        timestamp_gte: $startTime
        timestamp_lte: $endTime
      }
      orderBy: timestamp
      orderDirection: asc
    ) {
      account { id }
      timestamp
    }
  }
`;

type TokenSwap = {
    account: { id: string };
    timestamp: string;
};

type TokenSwapResponse = {
    tokenSwaps: TokenSwap[];
};


userStatsRouter.get('/metrics', async (c) => {
    try {
        const platform = (c.req.query('platform') || 'piperx') as 'piperx' | 'storyhunt';
        const now = Date.now() * 1000;
        const defaultStart = now - 30 * 24 * 60 * 60 * 1_000_000;
        const hasUserTime = !!(c.req.query('startTime') && c.req.query('endTime'));
        const startTime = c.req.query('startTime') || String(defaultStart);
        const endTime = c.req.query('endTime') || String(now);

        let pairIds: string[] = [];
        if (c.req.query('pairIds')) {
            pairIds = c.req.query('pairIds')!.split(',');
        } else {
            pairIds = Array.from(
                new Set(
                    Object.values(poolsConfig)
                        .filter((pool: any) => pool.isExist)
                        .map((pool: any) => pool.poolAddress.toLowerCase())
                )
            );
        }

        if (!pairIds.length) {
            return c.json({ error: 'No valid pairIds found' }, 400);
        }

        let swaps: TokenSwap[] = [];
        let skip = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
            const resp = await querySubgraph<TokenSwapResponse>(
                platform,
                GET_TOKEN_SWAPS,
                { pairIds, startTime, endTime, limit, skip }
            );
            console.log(resp)
            const data = resp.tokenSwaps || [];
            swaps = swaps.concat(data);
            console.log(swaps)

            if (data.length < limit) {
                hasMore = false;
            } else {
                skip += limit;
            }
        }

        if (hasUserTime) {
            const uniqueUsers = new Set(swaps.map(s => s.account.id.toLowerCase()));
            return c.json({
                platform,
                metrics: {
                    uniqueUsers: {
                        custom: uniqueUsers.size
                    }
                }
            });
        }

        const unique1d = new Set<string>();
        const unique7d = new Set<string>();
        const unique30d = new Set<string>();

        for (const s of swaps) {
            const acc = s.account.id.toLowerCase();
            const ts = parseInt(s.timestamp);

            if (ts >= now - 1 * 24 * 60 * 60 * 1_000_000) {
                unique1d.add(acc);
            }
            if (ts >= now - 7 * 24 * 60 * 60 * 1_000_000) {
                unique7d.add(acc);
            }
            if (ts >= now - 30 * 24 * 60 * 60 * 1_000_000) {
                unique30d.add(acc);
            }
        }

        return c.json({
            platform,
            metrics: {
                uniqueUsers: {
                    "1d": unique1d.size,
                    "7d": unique7d.size,
                    "30d": unique30d.size,
                }
            }
        });

    } catch (e: any) {
        console.error('Error in /metrics:', e);
        return c.json({ error: 'Internal server error', message: e.message }, 500);
    }
});

export default userStatsRouter;
