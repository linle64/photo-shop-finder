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
