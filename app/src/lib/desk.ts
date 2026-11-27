import { toJpegBase64 } from './image';
import type { LensItem } from './lens';

export interface DeskSite { site: string; status: 'ok' | 'blocked' | 'login' | 'error'; items: LensItem[] }

const NAMES: Record<string, string> = { taobao: '淘宝', '1688': '1688' };

/** 把照片发给家里电脑上的 desk/server.mjs，由电脑用已登录的浏览器做淘宝以图搜图。 */
export async function deskSearch(file: File, baseUrl: string): Promise<DeskSite[]> {
  const image = await toJpegBase64(file);
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image }),
    signal: AbortSignal.timeout(90000)
  }).catch((e: Error) => {
    throw new Error(e.name === 'TimeoutError' ? '家里电脑没有及时返回，请重试。' : '连不上家里电脑。请确认电脑开着、没休眠，且 iPhone 上的 Tailscale 已连接。');
  });
  const body = (await res.json().catch(() => null)) as { sites?: { site: string; status: DeskSite['status']; items: Omit<LensItem, 'source'>[] }[] } | null;
  if (!res.ok || !body?.sites) throw new Error('家里电脑的服务出错了，请重试。');
  return body.sites.map(s => ({ ...s, items: s.items.map(m => ({ ...m, source: NAMES[s.site] ?? s.site })) }));
}
