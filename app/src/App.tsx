import { useEffect, useRef, useState } from 'react';
import { HStack, Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Icon } from '@astryxdesign/core/Icon';
import { Banner } from '@astryxdesign/core/Banner';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Link } from '@astryxdesign/core/Link';
import { Token } from '@astryxdesign/core/Token';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { CameraIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { identify, IdentifyError, type Identified } from './lib/identify';
import { lensSearch, type LensItem } from './lib/lens';
import { deskSearch, type DeskSite } from './lib/desk';
import { SHOPS, STORES } from './lib/shops';

// 识别代理地址。部署 worker/ 后在构建时设置 VITE_API_URL，游客就不需要自己的密钥。
const API_URL = import.meta.env.VITE_API_URL ?? '';
// 以图搜图服务（worker/ 的 /lens）。构建时可设 VITE_LENS_URL，也可以在页面底部填写。
const LENS_URL = import.meta.env.VITE_LENS_URL ?? '';

export default function App() {
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [result, setResult] = useState<Identified | null>(null);
  const [picked, setPicked] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini-key') ?? '');
  const [keyDraft, setKeyDraft] = useState('');
  const [keyPrompt, setKeyPrompt] = useState(0);
  const [lensUrl, setLensUrl] = useState(() => LENS_URL || localStorage.getItem('lens-url') || '');
  const [lensDraft, setLensDraft] = useState('');
  const [lensItems, setLensItems] = useState<LensItem[] | null>(null);
  const [lensBusy, setLensBusy] = useState(false);
  const [lensError, setLensError] = useState('');
  const [deskUrl, setDeskUrl] = useState(() => localStorage.getItem('desk-url') ?? '');
  const [deskDraft, setDeskDraft] = useState('');
  const [deskSites, setDeskSites] = useState<DeskSite[] | null>(null);
  const [deskBusy, setDeskBusy] = useState(false);
  const [deskError, setDeskError] = useState('');
  const job = useRef(0);
  const lastFile = useRef<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const keyBox = useRef<HTMLElement>(null);

  // 需要密钥时，滚到密钥面板
  useEffect(() => {
    if (keyPrompt) keyBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [keyPrompt]);

  const keywordFor = (i: number, lang: 'jp' | 'zh') => edits[`${i}-${lang}`] ?? result?.keywords[i]?.[lang] ?? '';

  async function run(file: File, key = apiKey) {
    const my = ++job.current;
    lastFile.current = file;
    setError(null);
    // 以图搜图和关键词识别各走各的，互不影响
    setLensItems(null);
    setLensError('');
    setLensBusy(!!lensUrl);
    setDeskSites(null);
    setDeskError('');
    setDeskBusy(!!deskUrl);
    if (deskUrl) {
      void deskSearch(file, deskUrl)
        .then(sites => { if (my === job.current) setDeskSites(sites); })
        .catch((e: Error) => { if (my === job.current) setDeskError(e.message); })
        .finally(() => { if (my === job.current) setDeskBusy(false); });
    }
    if (lensUrl) {
      void lensSearch(file, lensUrl)
        .then(items => { if (my === job.current) setLensItems(items); })
        .catch((e: Error) => { if (my === job.current) setLensError(e.message); })
        .finally(() => { if (my === job.current) setLensBusy(false); });
    }
    if (!API_URL && !key) {
      setPhoto(URL.createObjectURL(file));
      if (!lensUrl && !deskUrl) {
        setError({ message: '先填入 Gemini 密钥才能识别商品，见页面底部。', retryable: false });
        setKeyPrompt(n => n + 1);
      }
      return;
    }
    // 失败时回到上一张照片和上一次的结果
    const previousPhoto = photo;
    const nextPhoto = URL.createObjectURL(file);
    setPhoto(nextPhoto);
    setBusy(true);
    setStatus('正在识别商品…');
    const out = await identify(file, API_URL, key, setStatus).catch((e: unknown) => {
      if (my === job.current) {
        const err = e instanceof IdentifyError ? e : new IdentifyError('出错了，请重试。');
        setError({ message: err.message, retryable: err.retryable });
        if (!API_URL && err.message.includes('密钥')) setKeyPrompt(n => n + 1);
      }
      return null;
    });
    if (my !== job.current) return;
    setBusy(false);
    setStatus('');
    if (!out) {
      if (result) { setPhoto(previousPhoto); URL.revokeObjectURL(nextPhoto); }
      return;
    }
    if (previousPhoto) URL.revokeObjectURL(previousPhoto);
    setResult(out);
    setPicked(0);
    setEdits({});
  }

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void run(file);
  }

  function saveKey() {
    const key = keyDraft.trim();
    localStorage.setItem('gemini-key', key);
    setApiKey(key);
    setKeyDraft('');
    if (lastFile.current) void run(lastFile.current, key);
  }

  const jpKeyword = keywordFor(picked, 'jp');
  const cnKeyword = keywordFor(picked, 'zh');
  const link = ([, url, tail = '']: (typeof SHOPS.jp)[number], keyword: string) => url + encodeURIComponent(keyword.trim()) + tail;
  const showResult = result && !busy;

  const siteRow = (name: string, href: string) => (
    <ClickableCard key={name} label={name} href={href} target="_blank" padding={3}>
      <HStack gap={2} vAlign="center" hAlign="between">
        <Text type="body" weight="bold">{name}</Text>
        <Icon icon={ArrowTopRightOnSquareIcon} size="sm" color="secondary" />
      </HStack>
    </ClickableCard>
  );

  const lensRow = (m: LensItem, i: number) => (
    <ClickableCard key={m.link + i} label={m.title} href={m.link} target="_blank" padding={3}>
      <HStack gap={3} vAlign="center">
        {m.thumbnail && (
          <Card padding={0} width={56}>
            <AspectRatio ratio={1}>
              <img src={m.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </AspectRatio>
          </Card>
        )}
        <VStack gap={0}>
          {m.price && <Text type="body" weight="bold">{m.price}</Text>}
          <Text type="body" maxLines={2}>{m.title}</Text>
          <Text type="supporting" color="secondary">{m.source}</Text>
        </VStack>
      </HStack>
    </ClickableCard>
  );

  return (
    <Layout
      height="fill"
      contentWidth={560}
      content={
        <LayoutContent role="main" padding={4}>
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={1}>拍照找货</Heading>
              {!result && <Text type="body" color="secondary">在日本看到想买的东西？拍下来，对比价格。</Text>}
            </VStack>

            <input ref={picker} type="file" accept="image/*" hidden onChange={choose} />

            {showResult || (busy && result) ? (
              <HStack gap={3} vAlign="start">
                <Card padding={0} width={72}>
                  <AspectRatio ratio={1}>
                    <img src={photo} alt="已选择的商品照片" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </AspectRatio>
                </Card>
                <VStack gap={1}>
                  <Heading level={2}>{busy ? '正在识别…' : result!.keywords[0].zh}</Heading>
                  {!busy && <Text type="body" color="secondary">{result!.summary}</Text>}
                </VStack>
              </HStack>
            ) : (
              <ClickableCard label="拍摄或选择商品照片" padding={0} onClick={() => picker.current?.click()}>
                <AspectRatio ratio={4 / 3}>
                  {photo ? (
                    <img src={photo} alt="已选择的商品照片" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <VStack gap={2} hAlign="center" vAlign="center" height="100%">
                      <Icon icon={CameraIcon} size="lg" color="secondary" />
                      <Text type="body" color="secondary">拍摄或选择一张商品照片</Text>
                    </VStack>
                  )}
                </AspectRatio>
              </ClickableCard>
            )}

            <Button
              label={result ? '再拍一张' : '拍照或选择照片'}
              variant={result ? 'secondary' : 'primary'}
              size="lg"
              width="100%"
              isLoading={busy}
              icon={<Icon icon={CameraIcon} color="inherit" />}
              onClick={() => picker.current?.click()}
            />
            <Text type="body" color="secondary" role="status" aria-live="polite">{busy ? status : ''}</Text>

            {error && (
              <Banner
                status="error"
                title={error.message}
                collapsible={false}
                endContent={error.retryable && lastFile.current ? <Button label="重试" onClick={() => void run(lastFile.current!)} /> : undefined}
              />
            )}

            {busy && (
              <VStack gap={2}>
                <Skeleton height={44} />
                <Skeleton height={44} index={1} />
                <Skeleton height={44} index={2} />
              </VStack>
            )}

            {(lensBusy || lensItems || lensError) && (
              <VStack gap={2}>
                <Heading level={2}>同款商品</Heading>
                {lensBusy && (
                  <VStack gap={2}>
                    <Skeleton height={72} />
                    <Skeleton height={72} index={1} />
                    <Skeleton height={72} index={2} />
                  </VStack>
                )}
                {lensError && <Banner status="error" title={lensError} collapsible={false} />}
                {lensItems && lensItems.length === 0 && <Text type="body" color="secondary">没有找到相似商品，换个角度或光线再拍一张。</Text>}
                {lensItems && lensItems.length > 0 && (
                  <VStack gap={2}>
                    <Text type="supporting" color="secondary">按图片相似度，来自 Google。价格仅供参考，以店铺页面为准。</Text>
                    {[...lensItems].sort((x, y) => Number(!!y.price) - Number(!!x.price)).slice(0, 12).map(lensRow)}
                    {lensItems.length > 12 && (
                      <Collapsible trigger={<Text type="body" weight="bold">更多相似页面</Text>} defaultIsOpen={false}>
                        <VStack gap={2}>{[...lensItems].sort((x, y) => Number(!!y.price) - Number(!!x.price)).slice(12).map(lensRow)}</VStack>
                      </Collapsible>
                    )}
                  </VStack>
                )}
              </VStack>
            )}

            {(deskBusy || deskSites || deskError) && (
              <VStack gap={2}>
                <Heading level={2}>淘宝同款（家里电脑）</Heading>
                {deskBusy && (
                  <VStack gap={2}>
                    <Text type="supporting" color="secondary">家里电脑正在淘宝上搜图，约需 20–30 秒…</Text>
                    <Skeleton height={72} />
                  </VStack>
                )}
                {deskError && <Banner status="error" title={deskError} collapsible={false} />}
                {deskSites?.map(site => (
                  <VStack key={site.site} gap={2}>
                    {site.status === 'blocked' && <Banner status="warning" title="淘宝要求验证，需要回到电脑前处理后再试。" collapsible={false} />}
                    {site.status === 'login' && <Banner status="warning" title="家里电脑上的淘宝登录过期了，需要在电脑上重新登录。" collapsible={false} />}
                    {site.status === 'error' && <Banner status="error" title="这次没有解析出淘宝结果，请重试。" collapsible={false} />}
                    {site.items.slice(0, 12).map(lensRow)}
                  </VStack>
                ))}
              </VStack>
            )}

            {showResult && (
              <VStack gap={5}>
                <VStack gap={2}>
                  <Text type="supporting" color="secondary">识别不准？换个说法</Text>
                  <Grid columns={{ minWidth: 96, max: 3 }} gap={2}>
                    {result.keywords.map((k, i) => (
                      <Token key={k.jp + i} size="lg" label={k.zh} color={i === picked ? 'blue' : 'default'} onClick={() => setPicked(i)} />
                    ))}
                  </Grid>
                </VStack>

                <VStack gap={2}>
                  <Heading level={2}>日本网店</Heading>
                  {SHOPS.jp.slice(0, 4).map(s => siteRow(s[0], link(s, jpKeyword)))}
                  <Collapsible trigger={<Text type="body" weight="bold">更多日本网店</Text>} defaultIsOpen={false}>
                    <VStack gap={2}>{SHOPS.jp.slice(4).map(s => siteRow(s[0], link(s, jpKeyword)))}</VStack>
                  </Collapsible>
                </VStack>

                <VStack gap={2}>
                  <Heading level={2}>国内平台</Heading>
                  {SHOPS.cn.map(s => siteRow(s[0], link(s, cnKeyword)))}
                  <Text type="supporting" color="secondary">价格为人民币，部分是代购价，仅供参考；部分页面需要登录或打开 App。拼多多网页版不支持图搜，只能在拼多多 App 里用“拍照搜同款”。</Text>
                </VStack>

                <VStack gap={2}>
                  <Heading level={2}>附近门店</Heading>
                  {STORES[result.storeType].map(([name, query]) => siteRow(name, 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query)))}
                  <Text type="supporting" color="secondary">在地图里搜索附近门店，到店后可对照价格。</Text>
                </VStack>

                <Collapsible trigger={<Text type="body" weight="bold">搜不到？改关键词</Text>} defaultIsOpen={false}>
                  <VStack gap={2}>
                    <TextInput label="日本网店（日文）" value={jpKeyword} onChange={v => setEdits(d => ({ ...d, [`${picked}-jp`]: v }))} />
                    <TextInput label="国内平台（中文）" value={cnKeyword} onChange={v => setEdits(d => ({ ...d, [`${picked}-zh`]: v }))} />
                  </VStack>
                </Collapsible>

                <Collapsible trigger={<Text type="body" weight="bold">退税提醒</Text>} defaultIsOpen={false}>
                  <Text type="body" color="secondary">日本免税购物自 2026 年 11 月起改为：店里先付含税价，出境时办理手续后再退还消费税。具体条件和截止日期请以日本观光厅官方说明为准。</Text>
                </Collapsible>
              </VStack>
            )}

            <Text type="supporting" color="secondary">照片会发给 Google（Gemini 识别、Lens 以图搜图）和 SerpApi 处理。请避免拍到人脸、证件和个人信息。</Text>

            {!LENS_URL && (
              <Collapsible trigger={<Text type="body" weight="bold">图搜服务地址</Text>} defaultIsOpen={!lensUrl}>
                <VStack gap={2}>
                  <Text type="supporting" color="secondary">填入你部署的 Worker 地址（形如 https://….workers.dev）。只保存在这台设备的浏览器里。</Text>
                  <TextInput label="服务地址" value={lensDraft} onChange={setLensDraft} autoComplete="off" />
                  <Button label="保存地址" onClick={() => { const url = lensDraft.trim(); localStorage.setItem('lens-url', url); setLensUrl(url); setLensDraft(''); }} />
                </VStack>
              </Collapsible>
            )}

            <Collapsible trigger={<Text type="body" weight="bold">家里电脑地址</Text>} defaultIsOpen={false}>
              <VStack gap={2}>
                <Text type="supporting" color="secondary">填入家里电脑的 Tailscale 地址（形如 https://….ts.net）。留空则不使用。只保存在这台设备的浏览器里。</Text>
                <TextInput label="电脑地址" value={deskDraft} onChange={setDeskDraft} autoComplete="off" />
                <Button label="保存地址" onClick={() => { const url = deskDraft.trim(); localStorage.setItem('desk-url', url); setDeskUrl(url); setDeskDraft(''); }} />
              </VStack>
            </Collapsible>

            {!API_URL && (
              <VStack gap={0} ref={keyBox}>
                <Collapsible key={keyPrompt} trigger={<Text type="body" weight="bold">使用自己的 Gemini 密钥</Text>} defaultIsOpen={!apiKey}>
                  <VStack gap={2}>
                    <Text type="supporting" color="secondary">
                      在 <Link href="https://aistudio.google.com/apikey" isExternalLink>aistudio.google.com/apikey</Link> 免费申请。密钥只保存在这台设备的浏览器里。
                    </Text>
                    <TextInput type="password" label="Gemini 密钥" value={keyDraft} onChange={setKeyDraft} autoComplete="off" hasAutoFocus={keyPrompt > 0} />
                    <Button label="保存密钥" onClick={saveKey} />
                  </VStack>
                </Collapsible>
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
