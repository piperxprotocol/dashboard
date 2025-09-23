import { Hono } from 'hono'
import { querySubgraph } from '../services/subgraph'

const whaleRouter = new Hono()

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
      amountUSD
      account { id }
    }
  }
`

type TokenSwap = {
    amountUSD: string
    account: { id: string }
}

async function getWhaleUserPercentageForPlatform(
    platform: 'piperx',
    pairIds: string[],
    startTime: string,
    endTime: string
): Promise<number> {
    let skip = 0
    const limit = 1000
    const whaleThreshold = 100 // 单笔 500u
    const whaleSet = new Set<string>() // 记录鲸鱼用户
    const allUsers = new Set<string>() // 记录总用户
    console.log("haha");
    while (true) {
        const data = await querySubgraph<{ tokenSwaps: TokenSwap[] }>(
            platform,
            GET_TOKEN_SWAPS,
            { pairIds, startTime, endTime, limit, skip }
        )
        console.log(JSON.stringify(data, null, 2))


        if (!data.tokenSwaps.length) break

        for (const swap of data.tokenSwaps) {
            const id = swap.account.id
            const amount = parseFloat(swap.amountUSD || '0') / 1e6
            allUsers.add(id)
            if (amount >= whaleThreshold) {
                whaleSet.add(id)
            }
        }

        skip += limit
    }

    const totalUsers = allUsers.size
    const whaleUsers = whaleSet.size

    return totalUsers > 0 ? (whaleUsers / totalUsers) * 100 : 0
}

whaleRouter.get('/metrics', async (c) => {
    const poolAddress = c.req.query('pairIds')
    if (!poolAddress) return c.json({ error: 'pairIds required' }, 400)

    const now = Date.now() * 1000 // 微秒
    const ranges = {
        '1d': (now - 86400 * 1_000_000).toString(),
        '7d': (now - 86400 * 7 * 1_000_000).toString(),
        '30d': (now - 86400 * 30 * 1_000_000).toString()
    }

    const [p1, p7, p30] = await Promise.all([
        getWhaleUserPercentageForPlatform('piperx', [poolAddress], ranges['1d'], now.toString()),
        getWhaleUserPercentageForPlatform('piperx', [poolAddress], ranges['7d'], now.toString()),
        getWhaleUserPercentageForPlatform('piperx', [poolAddress], ranges['30d'], now.toString())
    ])

    let result: any;

    result = {
        piperx_dex: {
            metrics: {
                '1d': p1,
                '7d': p7,
                '30d': p30
            }
        }
    };

    result["storyhunt_dex"] = { "metrics": { "1d": 0, "7d": 0, "30d": 0 } };
    result["mimboku_aggreator"] = { "metrics": { "1d": 0, "7d": 0, "30d": 0 } };
    result["piperx_aggreator"] = { "metrics": { "1d": 0, "7d": 0, "30d": 0 } };

    return c.json(result);
})

export default whaleRouter
