# 识别代理（Cloudflare Worker）

部署后游客不再需要自己的 Gemini 密钥。

```bash
cd worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY   # 粘贴付费项目的密钥
npx wrangler deploy                      # 输出形如 https://photo-shop-finder-api.<账号>.workers.dev
```

然后把地址填进 `index.html` 顶部的 `API_URL`。

上线前必做：
- 在 Cloudflare 控制台为这个 Worker 加限流规则（按 IP，例如每分钟 10 次）。
- 在 Google Cloud 给该密钥所在项目设预算告警和配额上限。
- `workers.dev` 在中国大陆常打不开，正式使用请绑定自有域名。
- 页面里的 BYOK 提示词与这里的 PROMPT 要保持一致。
