import { Hono } from 'hono'
import { querySubgraph } from '../services/subgraph'

const txRouter = new Hono()

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
      id
    }
  }
`

type TokenSwap = { id: string }

async function getTransactionCountForPlatform(
  platform: 'piperx', //目前先只管piperx
  pairIds: string[],
  startTime: string,
  endTime: string
): Promise<number> {
  let skip = 0
  const limit = 1000
  let count = 0

  while (true) {
    const data = await querySubgraph<{ tokenSwaps: TokenSwap[] }>(
      platform,
      GET_TOKEN_SWAPS,
      { pairIds, startTime, endTime, limit, skip }
    )

    if (!data.tokenSwaps.length) break

    count += data.tokenSwaps.length
    skip += limit
  }

  return count
}

txRouter.get('/metrics', async (c) => {
  const poolAddress = c.req.query('pairIds')
  if (!poolAddress) return c.json({ error: 'pairIds required' }, 400)

  const now = Date.now() * 1000 // 微秒
  const ranges = {
    '1d': (now - 86400 * 1_000_000).toString(),
    '7d': (now - 86400 * 7 * 1_000_000).toString(),
    '30d': (now - 86400 * 30 * 1_000_000).toString()
  }

  const [p1, p7, p30] = await Promise.all([
    getTransactionCountForPlatform('piperx', [poolAddress], ranges['1d'], now.toString()),
    getTransactionCountForPlatform('piperx', [poolAddress], ranges['7d'], now.toString()),
    getTransactionCountForPlatform('piperx', [poolAddress], ranges['30d'], now.toString())
  ])

  const result: any = {
    piperx: { metrics: { '1d': p1, '7d': p7, '30d': p30 } },
    storyhunt: { metrics: { '1d': 0, '7d': 0, '30d': 0 } },
    mimboku: { metrics: { '1d': 0, '7d': 0, '30d': 0 } },
    piper_aggregator: { metrics: { '1d': 0, '7d': 0, '30d': 0 } }
  }

  return c.json(result)
})

export default txRouter
