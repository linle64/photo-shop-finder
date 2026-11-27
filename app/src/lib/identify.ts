import type { StoreType } from './shops';
import { toJpegBase64 } from './image';

/** 带中文说明的识别错误；retryable 为 false 时重试没有意义。 */
export class IdentifyError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.retryable = retryable;
  }
}

export interface Keyword { zh: string; en: string; jp: string }
export interface Identified { keywords: Keyword[]; storeType: StoreType; summary: string }

/** 把照片发给后端（worker/）用 Gemini 识别商品。失败时抛出带中文说明的 IdentifyError。 */
export async function identify(file: File, apiUrl: string): Promise<Identified> {
  const image = await toJpegBase64(file).catch((e: Error) => { throw new IdentifyError(e.message, false); });
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image }),
    signal: AbortSignal.timeout(60000)
  }).catch((e: Error) => {
    throw new IdentifyError(e.name === 'TimeoutError' ? '识别超时，请重试。' : '连不上识别服务。请检查网络；若在中国大陆漫游，换日本本地网络或 Wi‑Fi 后重试。');
  });
  const body = (await res.json().catch(() => null)) as (Identified & { error?: string }) | null;
  if (!res.ok || !body?.keywords?.length) throw new IdentifyError(body?.error ?? '识别服务出错了，请重试。', res.status !== 422);
  return body;
}
