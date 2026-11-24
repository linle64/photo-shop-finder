import type { StoreType } from './shops';

/** 带中文说明的识别错误；retryable 为 false 时重试没有意义（例如密钥无效）。 */
export class IdentifyError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.retryable = retryable;
  }
}

export interface Keyword { zh: string; en: string; jp: string }
export interface Identified { keywords: Keyword[]; storeType: StoreType; summary: string }

// 以下提示词和 ../../worker/index.js 保持一致，仅在"自己的密钥"模式使用。
// 主模型繁忙(503)、额度用尽(429)或不存在(404)时，依次换下一个。
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const PROMPT = '你在帮来日本旅游的中文游客识别商品。识别图中的主要商品，输出：1) keywords：3 个购物网站搜索关键词，按从具体到通用排序（第 1 个是品牌加型号或款式，第 2 个是商品类型加关键特征，第 3 个只写品类），每个同时给中文 zh、英文 en、日文 jp，日文要用日本网店里实际使用的说法；品牌或型号看不清时不要编造。2) storeType：这件商品在日本通常去哪类店买。3) summary：用不超过 60 个中文字说明这是什么、怎么用、需要注意什么（如成分、适用人群、保质期）；包装上有日文时翻译要点。';
const KEYWORD = { type: 'OBJECT', required: ['zh', 'en', 'jp'], properties: { zh: { type: 'STRING' }, en: { type: 'STRING' }, jp: { type: 'STRING' } } };
const SCHEMA = {
  type: 'OBJECT',
  required: ['keywords', 'storeType', 'summary'],
  properties: {
    keywords: { type: 'ARRAY', minItems: 1, maxItems: 3, items: KEYWORD },
    storeType: { type: 'STRING', enum: ['drugstore', 'electronics', 'discount', 'supermarket', 'department', 'other'] },
    summary: { type: 'STRING' }
  }
};

/** 识别一张商品照片。失败时抛出带中文说明的 Error。apiUrl 为空时使用 key 直接调用 Gemini。 */
export async function identify(file: File, apiUrl: string, key: string, onRetry: (n: number) => void): Promise<Identified> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new IdentifyError('这张图片无法打开，请换一张 JPG 或 PNG 照片。', false);
  });
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!jpeg) throw new IdentifyError('这张图片太大，处理失败，请换一张或缩小后再试。', false);
  const dataUrl = await new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(jpeg);
  });
  const data = dataUrl.split(',')[1];

  const request = (model: string) => apiUrl
    ? fetch(apiUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: data }), signal: AbortSignal.timeout(30000) })
    : fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data } }, { text: PROMPT }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA }
        }),
        signal: AbortSignal.timeout(30000)
      });

  let res: Response | null = null;
  let retries = 0;
  const tried: string[] = [];
  let reason = '';
  for (const model of apiUrl ? [''] : MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let timedOut = false;
      res = await request(model).catch((e: Error) => { timedOut = e.name === 'TimeoutError'; return null; });
      if (!res) throw new IdentifyError(timedOut ? '识别超时，请重试。' : '连不上识别服务。请检查网络；若在中国大陆漫游，换日本本地网络或 Wi‑Fi 后重试。');
      if (res.status !== 503) break;
      if (attempt === 0) {
        onRetry(++retries);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    const detail = (await res!.clone().json().catch(() => null))?.error?.message as string | undefined;
    if (detail) reason = detail.slice(0, 120);
    tried.push(`${model.replace('gemini-', '')} ${res!.status}`);
    if (![503, 404, 429].includes(res!.status)) break;
  }
  if (res!.status === 429) throw new IdentifyError('今天的识别次数用完了，请稍后再试。', false);
  if (res!.status === 400 || res!.status === 403) throw new IdentifyError(apiUrl ? '识别服务暂时不可用。' : '密钥无效，请在页面底部重新填写。', false);
  if (!res!.ok) throw new IdentifyError(`识别服务繁忙（${tried.length ? tried.join('、') : res!.status}）${reason ? '：' + reason : ''}`);

  const body = await res!.json().catch(() => null);
  const text: string | undefined = apiUrl ? JSON.stringify(body) : body?.candidates?.[0]?.content?.parts?.[0]?.text;
  const out = text ? (JSON.parse(text) as Identified & { error?: string }) : null;
  if (!out?.keywords?.length) throw new IdentifyError(body?.error || '这张照片没能识别，请换个角度再拍。', false);
  return out;
}
