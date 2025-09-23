import { Hono } from 'hono'
import { querySubgraph } from '../services/subgraph'

const hfRouter = new Hono()

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
    }
  }
`

type TokenSwap = {
    account: { id: string }
}

async function getHighFrequencyUserPercentageForPlatform(
    platform: 'piperx',
    pairIds: string[],
    startTime: string,
    endTime: string
): Promise<number> {
    let skip = 0
    const limit = 1000
    const hfThreshold = 10 
    const userTrades: Record<string, number> = {}

    while (true) {
        const data = await querySubgraph<{ tokenSwaps: TokenSwap[] }>(
            platform,
            GET_TOKEN_SWAPS,
            { pairIds, startTime, endTime, limit, skip }
        )

        console.log(JSON.stringify(data, null, 2))
        if (!data.tokenSwaps.length) break

        for (const swap of data.tokenSwaps) {
            const id = swap.account.id.toLowerCase()
            userTrades[id] = (userTrades[id] || 0) + 1
        }

        skip += limit
    }

    const totalUsers = Object.keys(userTrades).length
    const hfUsers = Object.values(userTrades).filter(v => v > hfThreshold).length

    return totalUsers > 0 ? (hfUsers / totalUsers) * 100 : 0
}

hfRouter.get('/metrics', async (c) => {
    const poolAddress = c.req.query('pairIds')
    if (!poolAddress) return c.json({ error: 'pairIds required' }, 400)

    const now = Date.now() * 1000 // 微秒
    const ranges = {
        '1d': (now - 86400 * 1_000_000).toString(),
        '7d': (now - 86400 * 7 * 1_000_000).toString(),
        '30d': (now - 86400 * 30 * 1_000_000).toString()
    }

    const [p1, p7, p30] = await Promise.all([
        getHighFrequencyUserPercentageForPlatform('piperx', [poolAddress], ranges['1d'], now.toString()),
        getHighFrequencyUserPercentageForPlatform('piperx', [poolAddress], ranges['7d'], now.toString()),
        getHighFrequencyUserPercentageForPlatform('piperx', [poolAddress], ranges['30d'], now.toString())
    ])

    const result: any = {
        piperx: { metrics: { '1d': p1, '7d': p7, '30d': p30 } },
        storyhunt: { metrics: { '1d': 0, '7d': 0, '30d': 0 } },
        mimboku: { metrics: { '1d': 0, '7d': 0, '30d': 0 } },
        aggregator: { metrics: { '1d': 0, '7d': 0, '30d': 0 } }
    }

    return c.json(result)
})

export default hfRouter
