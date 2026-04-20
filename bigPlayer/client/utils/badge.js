/**
 * 徽章工具函数
 */

// emoji → CDN URL 映射表
const BADGE_EMOJI_MAP = {
  '花式点赞': '1f44d',
  '捧场专家': '1f4ac',
  '笔耕不辍': '1f4dd',
  '星之收藏者': '2b50',
  '准时上线': '1f680',
  '超能待机王': '1f6a2',
  '赞爆了': '1f44d',
  '超能偶像': '1f451',
  '引流之主': '1f4e2',
  '关注你了': '2764',
  '签到达人': '1f3c5'
}

export function getBadgeIcon(name) {
  return BADGE_EMOJI_MAP[name] || '1f3c5'
}

export function getBadgeEmojiUrl(codepoint) {
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codepoint}.svg`
}

export const BADGE_SHAPES = {
  PENTAGON: 'pentagon',    // 五边形：活跃成就
  CIRCLE: 'circle',        // 圆形：社交影响
  HEXAGON: 'hexagon'       // 六边形：展示槽（空槽）
}

export const BADGE_LEVELS = {
  NORMAL: 'normal',        // 普通
  RARE: 'rare',           // 珍贵
  UNCOMMON: 'uncommon',   // 稀有
  EPIC: 'epic',           // 史诗
  LEGEND: 'legend',       // 传奇
  UNEARNED: 'unearned'    // 未获得
}
