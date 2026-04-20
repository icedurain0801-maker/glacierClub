/**
 * 徽章墙页面数据
 */

export const getBadgeScreenData = () => ({
  currentUser: {
    id: '139736218',
    nickname: '玩家139736218',
    avatar: '🧒',
    earnedCount: 1
  },
  badges: {
    active: [
      { name: '花式点赞', emoji: '👍', earned: false, shape: 'pentagon', level: 'unearned', giftBadge: false },
      { name: '捧场专家', emoji: '💬', earned: false, shape: 'pentagon', level: 'unearned', giftBadge: false },
      { name: '笔耕不辍', emoji: '📝', earned: false, shape: 'pentagon', level: 'unearned', giftBadge: false },
      { name: '星之收藏者', emoji: '⭐', earned: false, shape: 'pentagon', level: 'unearned', giftBadge: true },
      { name: '准时上线', emoji: '🚀', earned: true, shape: 'pentagon', level: 'normal', giftBadge: true, upgradable: true },
      { name: '超能待机王', emoji: '🚢', earned: false, shape: 'pentagon', level: 'unearned', giftBadge: false }
    ],
    social: [
      { name: '赞爆了', emoji: '👍', earned: false, shape: 'circle', level: 'unearned' },
      { name: '超能偶像', emoji: '👑', earned: false, shape: 'circle', level: 'unearned' }
    ],
    spread: [
      { name: '引流之主', emoji: '📢', earned: false, shape: 'circle', level: 'unearned' },
      { name: '关注你了', emoji: '❤️', earned: false, shape: 'circle', level: 'unearned' }
    ]
  },
  displaySlots: [
    { filled: false },
    { filled: false },
    { filled: false }
  ]
})
