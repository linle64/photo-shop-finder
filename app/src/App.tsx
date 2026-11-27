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
import { Token } from '@astryxdesign/core/Token';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { CameraIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { identify, IdentifyError, type Identified } from './lib/identify';
import { lensSearch, type LensItem } from './lib/lens';
import { deskSearch, type DeskSite } from './lib/desk';
import { toThumbDataUrl } from './lib/image';
import { SHOPS, STORES } from './lib/shops';

// 后端（worker/）地址：识别、以图搜图的密钥都在后端，页面里没有任何密钥。构建时通过环境变量设置。
const API_URL = import.meta.env.VITE_API_URL ?? '';
// 家里电脑的 Tailscale 地址（淘宝以图搜图）。留空则不显示这一块。
const DESK_URL = import.meta.env.VITE_DESK_URL ?? '';
const TABS = ['jp', 'cn', 'history'] as const;
// 左右滑动的容器：每一页恰好占满一屏宽，滑动后停在页的起点
const TRACK = { overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' } as const;
const PANE = { flex: '0 0 100%', minWidth: 0, scrollSnapAlign: 'start' } as const;

interface HistoryEntry { id: number; at: number; thumb: string; title: string; result: Identified | null; lens: LensItem[]; desk: DeskSite[] }

export default function App() {
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [result, setResult] = useState<Identified | null>(null);
  const [picked, setPicked] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [lensItems, setLensItems] = useState<LensItem[] | null>(null);
  const [lensBusy, setLensBusy] = useState(false);
  const [lensError, setLensError] = useState('');
  const [deskSites, setDeskSites] = useState<DeskSite[] | null>(null);
  const [deskBusy, setDeskBusy] = useState(false);
  const [deskError, setDeskError] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]>('jp');
  const [history, setHistory] = useState<HistoryEntry[]>(() => JSON.parse(localStorage.getItem('history') ?? '[]'));
  const job = useRef(0);
  const savedJob = useRef(0);
  const lastFile = useRef<File | null>(null);
  const thumb = useRef('');
  const picker = useRef<HTMLInputElement>(null);
  const track = useRef<HTMLDivElement>(null);

  // 左右滑动时，让顶部标签跟着切换
  useEffect(() => {
    const scroller = track.current;
    if (!scroller) return;
    const onScroll = () => setTab(TABS[Math.round(scroller.scrollLeft / scroller.clientWidth)] ?? 'jp');
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  // 一次搜索的几路结果都出来后，存进历史
  useEffect(() => {
    if (busy || lensBusy || deskBusy || savedJob.current === job.current || !lastFile.current) return;
    if (!result && !lensItems && !deskSites) return;
    savedJob.current = job.current;
    const next = [{
      id: Date.now(),
      at: Date.now(),
      thumb: thumb.current,
      title: result?.keywords[0].zh ?? lensItems?.[0]?.title ?? '商品照片',
      result,
      lens: (lensItems ?? []).slice(0, 20),
      desk: (deskSites ?? []).map(s => ({ ...s, items: s.items.slice(0, 12) }))
    }, ...history].slice(0, 15);
    setHistory(next);
    localStorage.setItem('history', JSON.stringify(next));
  }, [busy, lensBusy, deskBusy, result, lensItems, deskSites]);

  const keywordFor = (i: number, lang: 'jp' | 'zh') => edits[`${i}-${lang}`] ?? result?.keywords[i]?.[lang] ?? '';

  async function run(file: File) {
    const my = ++job.current;
    lastFile.current = file;
    // 三路各走各的，互不影响
    setError(null);
    setResult(null);
    setPicked(0);
    setEdits({});
    setLensItems(null);
    setLensError('');
    setLensBusy(true);
    setDeskSites(null);
    setDeskError('');
    setDeskBusy(!!DESK_URL);
    void toThumbDataUrl(file).then(t => { thumb.current = t; });
    void lensSearch(file, API_URL)
      .then(items => { if (my === job.current) setLensItems(items); })
      .catch((e: Error) => { if (my === job.current) setLensError(e.message); })
      .finally(() => { if (my === job.current) setLensBusy(false); });
    if (DESK_URL) {
      void deskSearch(file, DESK_URL)
        .then(sites => { if (my === job.current) setDeskSites(sites); })
        .catch((e: Error) => { if (my === job.current) setDeskError(e.message); })
        .finally(() => { if (my === job.current) setDeskBusy(false); });
    }
    if (photo.startsWith('blob:')) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(file));
    setBusy(true);
    setStatus('正在识别商品…');
    const out = await identify(file, API_URL).catch((e: unknown) => {
      if (my === job.current) {
        const err = e instanceof IdentifyError ? e : new IdentifyError('出错了，请重试。');
        setError({ message: err.message, retryable: err.retryable });
      }
      return null;
    });
    if (my !== job.current) return;
    setBusy(false);
    setStatus('');
    if (out) setResult(out);
  }

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void run(file);
  }

  function openHistory(entry: HistoryEntry) {
    job.current += 1;
    savedJob.current = job.current;
    lastFile.current = null;
    if (photo.startsWith('blob:')) URL.revokeObjectURL(photo);
    setPhoto(entry.thumb);
    setBusy(false);
    setLensBusy(false);
    setDeskBusy(false);
    setError(null);
    setLensError('');
    setDeskError('');
    setResult(entry.result);
    setPicked(0);
    setEdits({});
    setLensItems(entry.lens);
    setDeskSites(entry.desk);
    setTab('jp');
    track.current?.scrollTo({ left: 0 });
  }

  const jpKeyword = keywordFor(picked, 'jp');
  const cnKeyword = keywordFor(picked, 'zh');
  const link = ([, url, tail = '']: (typeof SHOPS.jp)[number], keyword: string) => url + encodeURIComponent(keyword.trim()) + tail;
  const working = busy || lensBusy || deskBusy;

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

  const pricedFirst = (items: LensItem[]) => [...items].sort((x, y) => Number(!!y.price) - Number(!!x.price));

  return (
    <Layout
      height="fill"
      contentWidth={560}
      content={
        <LayoutContent role="main" padding={4}>
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={1}>拍照找货</Heading>
              {!photo && <Text type="body" color="secondary">在日本看到想买的东西？拍下来，对比价格。</Text>}
            </VStack>

            <input ref={picker} type="file" accept="image/*" hidden onChange={choose} />

            {photo ? (
              <HStack gap={3} vAlign="start">
                <ClickableCard label="换一张照片" padding={0} width={96} onClick={() => picker.current?.click()}>
                  <AspectRatio ratio={1}>
                    <img src={photo} alt="已选择的商品照片" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </AspectRatio>
                </ClickableCard>
                <VStack gap={2}>
                  <Heading level={2}>{result ? result.keywords[0].zh : busy ? '正在识别…' : '商品照片'}</Heading>
                  {result && <Text type="body" color="secondary">{result.summary}</Text>}
                  <HStack gap={2} vAlign="center">
                    {lastFile.current && (
                      <Button label="再试一次" variant="secondary" isLoading={working} onClick={() => void run(lastFile.current!)} />
                    )}
                    <Text type="supporting" color="secondary">点照片换一张</Text>
                  </HStack>
                </VStack>
              </HStack>
            ) : (
              <ClickableCard label="拍摄或选择商品照片" padding={0} onClick={() => picker.current?.click()}>
                <AspectRatio ratio={4 / 3}>
                  <VStack gap={2} hAlign="center" vAlign="center" height="100%">
                    <Icon icon={CameraIcon} size="lg" color="secondary" />
                    <Text type="body" color="secondary">拍摄或选择一张商品照片</Text>
                  </VStack>
                </AspectRatio>
              </ClickableCard>
            )}
            <Text type="body" color="secondary" role="status" aria-live="polite">{busy ? status : ''}</Text>

            {error && (
              <Banner
                status="warning"
                title={`关键词识别失败：${error.message}`}
                collapsible={false}
                endContent={error.retryable && lastFile.current ? <Button label="重试" onClick={() => void run(lastFile.current!)} /> : undefined}
              />
            )}

            {result && (
              <VStack gap={2}>
                <Text type="supporting" color="secondary">识别不准？换个说法</Text>
                <Grid columns={{ minWidth: 96, max: 3 }} gap={2}>
                  {result.keywords.map((k, i) => (
                    <Token key={k.jp + i} size="lg" label={k.zh} color={i === picked ? 'blue' : 'default'} onClick={() => setPicked(i)} />
                  ))}
                </Grid>
                <Collapsible trigger={<Text type="body" weight="bold">搜不到？改关键词</Text>} defaultIsOpen={false}>
                  <VStack gap={2}>
                    <TextInput label="日本网店（日文）" value={jpKeyword} onChange={v => setEdits(d => ({ ...d, [`${picked}-jp`]: v }))} />
                    <TextInput label="国内平台（中文）" value={cnKeyword} onChange={v => setEdits(d => ({ ...d, [`${picked}-zh`]: v }))} />
                  </VStack>
                </Collapsible>
              </VStack>
            )}

            <TabList
              value={tab}
              layout="fill"
              hasDivider
              onChange={v => { setTab(v as (typeof TABS)[number]); track.current?.scrollTo({ left: TABS.indexOf(v as (typeof TABS)[number]) * track.current.clientWidth }); }}
            >
              <Tab value="jp" label="日本" />
              <Tab value="cn" label="国内" />
              <Tab value="history" label="历史" />
            </TabList>

            <HStack ref={track} gap={0} vAlign="start" style={TRACK} aria-label="日本、国内、历史">
              <VStack gap={5} style={PANE}>
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
                        {pricedFirst(lensItems).slice(0, 12).map(lensRow)}
                        {lensItems.length > 12 && (
                          <Collapsible trigger={<Text type="body" weight="bold">更多相似页面</Text>} defaultIsOpen={false}>
                            <VStack gap={2}>{pricedFirst(lensItems).slice(12).map(lensRow)}</VStack>
                          </Collapsible>
                        )}
                      </VStack>
                    )}
                  </VStack>
                )}

                {result && (
                  <VStack gap={2}>
                    <Heading level={2}>日本网店</Heading>
                    {SHOPS.jp.slice(0, 4).map(s => siteRow(s[0], link(s, jpKeyword)))}
                    <Collapsible trigger={<Text type="body" weight="bold">更多日本网店</Text>} defaultIsOpen={false}>
                      <VStack gap={2}>{SHOPS.jp.slice(4).map(s => siteRow(s[0], link(s, jpKeyword)))}</VStack>
                    </Collapsible>
                  </VStack>
                )}

                {result && (
                  <VStack gap={2}>
                    <Heading level={2}>附近门店</Heading>
                    {STORES[result.storeType].map(([name, query]) => siteRow(name, 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query)))}
                    <Text type="supporting" color="secondary">在地图里搜索附近门店，到店后可对照价格。</Text>
                  </VStack>
                )}

                {!photo && <Text type="body" color="secondary">拍一张照片，这里会显示日本网店的同款商品。</Text>}

                <Collapsible trigger={<Text type="body" weight="bold">退税提醒</Text>} defaultIsOpen={false}>
                  <Text type="body" color="secondary">日本免税购物自 2026 年 11 月起改为：店里先付含税价，出境时办理手续后再退还消费税。具体条件和截止日期请以日本观光厅官方说明为准。</Text>
                </Collapsible>
              </VStack>

              <VStack gap={5} style={PANE}>
                {DESK_URL && (deskBusy || deskSites || deskError) && (
                  <VStack gap={2}>
                    <Heading level={2}>淘宝同款</Heading>
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

                {result && (
                  <VStack gap={2}>
                    <Heading level={2}>国内平台</Heading>
                    {SHOPS.cn.map(s => siteRow(s[0], link(s, cnKeyword)))}
                    <Text type="supporting" color="secondary">价格为人民币，部分是代购价，仅供参考；部分页面需要登录或打开 App。拼多多网页版不支持图搜，只能在拼多多 App 里用“拍照搜同款”。</Text>
                  </VStack>
                )}

                {!photo && <Text type="body" color="secondary">拍一张照片，这里会显示淘宝的同款商品和国内平台的搜索入口。</Text>}
              </VStack>

              <VStack gap={2} style={PANE}>
                {history.length === 0 && <Text type="body" color="secondary">还没有搜索记录。</Text>}
                {history.map(h => (
                  <ClickableCard key={h.id} label={h.title} padding={3} onClick={() => openHistory(h)}>
                    <HStack gap={3} vAlign="center">
                      <Card padding={0} width={56}>
                        <AspectRatio ratio={1}>
                          <img src={h.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </AspectRatio>
                      </Card>
                      <VStack gap={0}>
                        <Text type="body" weight="bold" maxLines={1}>{h.title}</Text>
                        <Text type="supporting" color="secondary">{new Date(h.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                      </VStack>
                    </HStack>
                  </ClickableCard>
                ))}
                {history.length > 0 && (
                  <Button label="清空历史" variant="secondary" onClick={() => { setHistory([]); localStorage.removeItem('history'); }} />
                )}
              </VStack>
            </HStack>

            <Text type="supporting" color="secondary">照片会发给 Google（Gemini 识别、Lens 以图搜图）和 SerpApi 处理，淘宝以图搜图在你自己的电脑上进行。请避免拍到人脸、证件和个人信息。</Text>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
