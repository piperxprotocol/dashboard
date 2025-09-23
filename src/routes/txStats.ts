import { Hono } from 'hono'
import { querySubgraph } from '../services/subgraph'

const txStatsRouter = new Hono()

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
      timestamp
    }
  }
`

type TokenSwap = {
  amountUSD: string
  timestamp: string
}

async function getTransactionStatsForPlatform(
  platform: 'piperx',
  pairIds: string[],
  startTime: string,
  endTime: string
): Promise<{
  '1d': { transactionCount: number; averageAmount: number }
  '7d': { transactionCount: number; averageAmount: number }
  '30d': { transactionCount: number; averageAmount: number }
}> {
  let skip = 0
  const limit = 1000
  const swaps: TokenSwap[] = []

  while (true) {
    const data = await querySubgraph<{ tokenSwaps: TokenSwap[] }>(
      platform,
      GET_TOKEN_SWAPS,
      { pairIds, startTime, endTime, limit, skip }
    )
    if (!data.tokenSwaps.length) break

    swaps.push(...data.tokenSwaps)
    skip += limit
  }

  // 转成 number
  const parsed = swaps.map(s => ({
    ts: Number(s.timestamp),
    amount: parseFloat(s.amountUSD || '0') / 1e6 // 注意除以1e6
  }))

  const now = Math.floor(Date.now() / 1000)
  const cut1d = now - 86400
  const cut7d = now - 86400 * 7
  const cut30d = now - 86400 * 30

  function calcStats(startCut: number) {
    const selected = parsed.filter(s => s.ts >= startCut)
    const txCount = selected.length
    const avg = txCount > 0 ? selected.reduce((sum, s) => sum + s.amount, 0) / txCount : 0
    return { transactionCount: txCount, averageAmount: avg }
  }

  return {
    '1d': calcStats(cut1d),
    '7d': calcStats(cut7d),
    '30d': calcStats(cut30d)
  }
}

txStatsRouter.get('/metrics', async (c) => {
  const poolAddress = c.req.query('pairIds')
  if (!poolAddress) return c.json({ error: 'pairIds required' }, 400)

  const now = Date.now() * 1000
  const thirtyDaysAgo = (now - 86400 * 30 * 1_000_000).toString()

  const metrics = await getTransactionStatsForPlatform(
    'piperx',
    [poolAddress],
    thirtyDaysAgo,
    now.toString()
  )

  const result: any = {
    piperx: { metrics },
    storyhunt: { metrics: { '1d': { transactionCount: 0, averageAmount: 0 }, '7d': { transactionCount: 0, averageAmount: 0 }, '30d': { transactionCount: 0, averageAmount: 0 } } },
    mimboku: { metrics: { '1d': { transactionCount: 0, averageAmount: 0 }, '7d': { transactionCount: 0, averageAmount: 0 }, '30d': { transactionCount: 0, averageAmount: 0 } } },
    aggregator: { metrics: { '1d': { transactionCount: 0, averageAmount: 0 }, '7d': { transactionCount: 0, averageAmount: 0 }, '30d': { transactionCount: 0, averageAmount: 0 } } }
  }

  return c.json(result)
})

export default txStatsRouter
