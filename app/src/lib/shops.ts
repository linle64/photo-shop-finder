export type StoreType = 'drugstore' | 'electronics' | 'discount' | 'supermarket' | 'department' | 'other';
export type Market = 'jp' | 'cn' | 'store';

// [显示名, 搜索地址前缀, 关键词后缀]
export const SHOPS: Record<'jp' | 'cn', [string, string, string?][]> = {
  jp: [
    ['价格.com', 'https://search.kakaku.com/', '/'],
    ['Amazon 日本', 'https://www.amazon.co.jp/s?k='],
    ['乐天市场', 'https://search.rakuten.co.jp/search/mall/', '/'],
    ['Yahoo! 购物', 'https://shopping.yahoo.co.jp/search?p='],
    ['Mercari 二手', 'https://jp.mercari.com/search?keyword='],
    ['Yodobashi', 'https://www.yodobashi.com/?word='],
    ['Bic Camera', 'https://www.biccamera.com/bc/category/?q=']
  ],
  cn: [
    ['淘宝', 'https://s.taobao.com/search?q='],
    ['京东', 'https://so.m.jd.com/ware/search.action?keyword='],
    ['拼多多', 'https://mobile.yangkeduo.com/search_result.html?search_key=']
  ]
};

// [显示名, 地图搜索词]：在日本的地图里用日文名命中更好
export const STORES: Record<StoreType, [string, string][]> = {
  drugstore: [['松本清', 'マツモトキヨシ'], ['Sundrug', 'サンドラッグ'], ['Tsuruha', 'ツルハドラッグ'], ['唐吉诃德', 'ドン・キホーテ']],
  electronics: [['Yodobashi', 'ヨドバシカメラ'], ['Bic Camera', 'ビックカメラ'], ['Yamada 电器', 'ヤマダデンキ'], ['Edion', 'エディオン']],
  discount: [['唐吉诃德', 'ドン・キホーテ'], ['大创', 'ダイソー'], ['无印良品', '無印良品']],
  supermarket: [['超市', 'スーパー'], ['便利店', 'コンビニ'], ['唐吉诃德', 'ドン・キホーテ']],
  department: [['百货商店', '百貨店'], ['优衣库', 'ユニクロ'], ['ABC-MART', 'ABCマート']],
  other: [['唐吉诃德', 'ドン・キホーテ'], ['百货商店', '百貨店'], ['LOFT', 'ロフト'], ['东急手创馆', '東急ハンズ']]
};

export const KEYWORD_LANG = { jp: 'jp', cn: 'zh', store: 'jp' } as const;
