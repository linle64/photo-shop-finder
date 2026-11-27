// 拍照找货识别代理：密钥、提示词、限制都在这里，页面只传一张图片。
const MODEL = 'gemini-3.8-flash';
const MAX_IMAGE_CHARS = 1_500_000; // base64 约 1.1MB
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

export default {
  async fetch(req, env) {
    const cors = { 'access-control-allow-origin': env.ALLOWED_ORIGIN, 'access-control-allow-headers': 'content-type', vary: 'origin' };
    const reply = (body, status = 200) => Response.json(body, { status, headers: cors });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST' || req.headers.get('origin') !== env.ALLOWED_ORIGIN) return reply({ error: '不允许的请求' }, 403);

    const { image } = await req.json();
    if (typeof image !== 'string' || image.length > MAX_IMAGE_CHARS) return reply({ error: '图片太大或格式不对' }, 413);

    // /lens：用 SerpApi 的 Google Lens 以图搜图，返回同款商品列表（店名、价格、链接）。
    if (new URL(req.url).pathname === '/lens') {
      const bytes = Uint8Array.from(atob(image), c => c.charCodeAt(0));
      if (bytes.length > 500_000) return reply({ error: '图片超过 500KB，请缩小后再试' }, 413);
      const form = new FormData();
      form.append('image', new Blob([bytes], { type: 'image/jpeg' }), 'photo.jpg');
      form.append('api_key', env.SERPAPI_KEY);
      const up = await fetch('https://serpapi.com/image', { method: 'POST', body: form }).then(r => r.json()).catch(() => ({}));
      if (!up.image_id) return reply({ error: up.error ?? '图搜服务暂时不可用' }, 502);
      const query = new URLSearchParams({ engine: 'google_lens', image_id: up.image_id, hl: 'ja', country: 'jp', type: 'visual_matches', api_key: env.SERPAPI_KEY });
      const found = await fetch(`https://serpapi.com/search.json?${query}`).then(r => r.json()).catch(() => ({ error: '图搜服务暂时不可用' }));
      if (found.error) return reply({ error: found.error }, 502);
      return reply({ items: (found.visual_matches ?? []).slice(0, 60).map(m => ({ title: m.title, source: m.source, link: m.link, price: m.price?.value ?? '', thumbnail: m.thumbnail })) });
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: image } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA }
      })
    });
    if (!res.ok) return reply({ error: '识别服务繁忙，请稍后再试' }, res.status === 429 ? 429 : 503);

    const text = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return reply({ error: '这张照片没能识别，请换个角度再拍' }, 422);
    return reply(JSON.parse(text));
  }
};
