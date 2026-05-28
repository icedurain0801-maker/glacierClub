export type FixedPrizeKey = 'empiricalValue' | 'memberPointValue';

const FIXED_PRIZE_TEXT_DICT: Record<string, Record<FixedPrizeKey, string>> = {
    'zh-cn': { empiricalValue: '经验值', memberPointValue: '会员积分' },
    'zh-tw': { empiricalValue: '經驗值', memberPointValue: '會員積分' },
    // 部分环境可能传 zh-HK，这里也按繁体处理
    'zh-hk': { empiricalValue: '經驗值', memberPointValue: '會員積分' },
    'en-us': { empiricalValue: 'EXP', memberPointValue: 'Member Points' },
    'ko-kr': { empiricalValue: '경험치', memberPointValue: '멤버십 포인트' },
    'ja-jp': { empiricalValue: '経験値', memberPointValue: '会員ポイント' },
};

export function getFixedPrizeGoodsName(type: FixedPrizeKey, language?: string): string {
    const normalized = String(language || '')
        .trim()
        .toLowerCase();
    const t = FIXED_PRIZE_TEXT_DICT[normalized] || FIXED_PRIZE_TEXT_DICT['en-us'];
    return t[type];
}
