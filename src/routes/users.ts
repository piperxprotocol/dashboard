import { Hono } from 'hono';
import { querySubgraph } from '../services/subgraph';

const usersRouter = new Hono();

const GET_TOKEN_SWAPS_IN_TIME_RANGE = `
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

type Swap = {
  account: { id: string };
  timestamp: string;
};

async function fetchAllSwaps(
  platform: 'piperx' | 'storyhunt',
  pairIds: string[],
  startTime: string,
  endTime: string
): Promise<Swap[]> {
  const limit = 1000;
  let skip = 0;
  let all: Swap[] = [];

  while (true) {
    const res = await querySubgraph<{ tokenSwaps: Swap[] }>(
      platform,
      GET_TOKEN_SWAPS_IN_TIME_RANGE,
      { pairIds, startTime, endTime, limit, skip }
    );

    const batch = res.tokenSwaps || [];
    all = all.concat(batch);

    if (batch.length < limit) break;
    skip += limit;
  }
  return all;
}

function groupUsers(swaps: Swap[]) {
  const dau: Record<string, Set<string>> = {};
  const wau: Record<string, Set<string>> = {};
  const mau: Record<string, Set<string>> = {};

  for (const swap of swaps) {
    const ts = new Date(parseInt(swap.timestamp) * 1000); // timestamp 秒级
    const user = swap.account.id;

    // day
    const day = ts.toISOString().slice(0, 10); // YYYY-MM-DD
    if (!dau[day]) dau[day] = new Set();
    dau[day].add(user);

    // week (ISO week number)
    const week = `${ts.getUTCFullYear()}-W${Math.ceil(ts.getUTCDate() / 7)}`;
    if (!wau[week]) wau[week] = new Set();
    wau[week].add(user);

    // month
    const month = ts.toISOString().slice(0, 7); // YYYY-MM
    if (!mau[month]) mau[month] = new Set();
    mau[month].add(user);
  }

  return {
    dau: Object.entries(dau).map(([date, set]) => ({ date, count: set.size })),
    wau: Object.entries(wau).map(([week, set]) => ({ week, count: set.size })),
    mau: Object.entries(mau).map(([month, set]) => ({ month, count: set.size })),
  };
}

usersRouter.get('/users/metrics', async (c) => {
  try {
    const platform = (c.req.query('platform') || 'piperx') as 'piperx' | 'storyhunt';
    const pairIds = (c.req.query('pairIds') || '').split(',').map(id => id.toLowerCase());
    const startTime = c.req.query('startTime');
    const endTime = c.req.query('endTime');

    if (!pairIds.length || !startTime || !endTime) {
      return c.json({ error: 'Missing required parameters' }, 400);
    }

    const swaps = await fetchAllSwaps(platform, pairIds, startTime, endTime);
    const { dau, wau, mau } = groupUsers(swaps);

    return c.json({ platform, pairIds, dau, wau, mau });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default usersRouter;
