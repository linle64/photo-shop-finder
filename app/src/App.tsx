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
import { SHOPS, STORES } from './lib/shops';

// 识别代理地址。部署 worker/ 后在构建时设置 VITE_API_URL，游客就不需要自己的密钥。
const API_URL = import.meta.env.VITE_API_URL ?? '';

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
    if (!API_URL && !key) {
      setPhoto(URL.createObjectURL(file));
      setError({ message: '先填入 Gemini 密钥才能识别商品，见页面底部。', retryable: false });
      setKeyPrompt(n => n + 1);
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
                  <Text type="supporting" color="secondary">价格为人民币，部分是代购价，仅供参考；部分页面需要登录或打开 App。</Text>
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

            {photo && !busy && (
              <VStack gap={2}>
                <Heading level={2}>用各 App 以图搜图</Heading>
                <Text type="body" color="secondary">不依赖上面的识别。先把照片存进相册，再到各 App 的相机搜索里选最新一张。</Text>
                {lastFile.current && navigator.canShare?.({ files: [lastFile.current] }) && (
                  <Button
                    label="保存照片 / 分享给 App"
                    variant="secondary"
                    size="lg"
                    width="100%"
                    onClick={() => void navigator.share({ files: [lastFile.current!] }).catch(() => undefined)}
                  />
                )}
                <Text type="supporting" color="secondary">在分享菜单里选「存储图像」。若菜单里直接有 Google 或其他 App，也可以直接选。</Text>
                {[
                  ['Google Lens', '打开 Google App，点搜索栏里的相机图标，选最新照片。'],
                  ['Amazon', '打开 Amazon App，点搜索栏右侧的相机图标，选最新照片。'],
                  ['乐天市场', '打开乐天 App，用搜索栏里的图片搜索（画像検索），选最新照片。'],
                  ['Mercari', '打开 Mercari App，点搜索栏里的相机图标，选最新照片。'],
                  ['淘宝 / 京东 / 拼多多', '打开 App，找搜索栏里的相机图标，选最新照片。入口位置因版本而异，我没有逐一核实。']
                ].map(([name, steps]) => (
                  <VStack key={name} gap={0}>
                    <Text type="body" weight="bold">{name}</Text>
                    <Text type="supporting" color="secondary">{steps}</Text>
                  </VStack>
                ))}
              </VStack>
            )}

            <Text type="supporting" color="secondary">照片仅用于识别商品，由 Google Gemini 处理。请避免拍到人脸、证件和个人信息。</Text>

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
