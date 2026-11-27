import { toJpegBase64 } from './image';

export interface LensItem { title: string; source: string; link: string; price: string; thumbnail: string }

/** 把照片发给自己的 Worker 做 Google Lens 以图搜图。失败时抛出带中文说明的 Error。 */
export async function lensSearch(file: File, baseUrl: string): Promise<LensItem[]> {
  const image = await toJpegBase64(file);
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/lens`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image }),
    signal: AbortSignal.timeout(40000)
  }).catch((e: Error) => {
    throw new Error(e.name === 'TimeoutError' ? '图搜超时，请重试。' : '连不上图搜服务，请检查网络和服务地址。');
  });
  const body = (await res.json().catch(() => null)) as { items?: LensItem[]; error?: string } | null;
  if (!res.ok || !body?.items) throw new Error(body?.error ?? '图搜服务出错了，请重试。');
  return body.items;
}
