import { SUBGRAPH_URLS } from '../config/env';

export async function querySubgraph<T>(
  platform: 'piperx' | 'storyhunt',
  query: string,
  variables: any
): Promise<T> {
  const url = SUBGRAPH_URLS[platform];
  if (!url) throw new Error(`Unsupported platform: ${platform}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as { data: T; errors?: any };
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.data;
}
