const mockLanguages = [
  { languageID: 1, language: 'Simplified Chinese', code: 'zh-CN', value: 'zh-CN', label: 'Simplified Chinese' },
  { languageID: 2, language: 'English', code: 'en-US', value: 'en-US', label: 'English' },
  { languageID: 3, language: 'Japanese', code: 'ja-JP', value: 'ja-JP', label: 'Japanese' },
  { languageID: 4, language: 'Korean', code: 'ko-KR', value: 'ko-KR', label: 'Korean' },
];
const goodsIcon =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 48 48%22%3E%3Crect width=%2248%22 height=%2248%22 rx=%228%22 fill=%22%23fff7e6%22/%3E%3Ctext x=%2224%22 y=%2229%22 text-anchor=%22middle%22 font-size=%2210%22 fill=%22%23d46b08%22%3EGoods%3C/text%3E%3C/svg%3E';

const goodsInfo = [
  { GoodsId: 1001, Name: 'Gold Pack', Icon: goodsIcon },
  { GoodsId: 1002, Name: 'Avatar Frame', Icon: goodsIcon },
];

const multiLanguageGoodsInfo = [
  { GoodsId: 1001, Language: 'en-US', Name: 'Gold Pack', Icon: goodsIcon },
  { GoodsId: 1002, Language: 'en-US', Name: 'Avatar Frame', Icon: goodsIcon },
];

const clubUrlDemo = [
  {
    urlDemo: 'https://example.com/club/path?boardId={boardId}&sectionId={sectionId}',
    params: 'boardId: 版块 ID\nsectionId: 栏目 ID\npostId: 帖子 ID\nuserId: 用户 ID',
  },
];

export async function getAppConfigCenterList(query: { appId?: string; tableName: string }) {
  if (query?.tableName === 'clubUrlDemo') {
    return clubUrlDemo;
  }

  return mockLanguages;
}

export async function getGameConfigCenterCompatible(query: any) {
  if (query?.tableName === 'MutiLanguageGoodsInfo') {
    return { data: multiLanguageGoodsInfo, code: 0, total: multiLanguageGoodsInfo.length, msg: '' };
  }

  if (query?.tableName === 'GoodsInfo') {
    return { data: goodsInfo, code: 0, total: goodsInfo.length, msg: '' };
  }

  return { data: [], code: 0, total: 0, msg: '' };
}
