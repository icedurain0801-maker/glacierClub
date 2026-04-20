/**
 * Mock 数据 — 徽章系统
 */

export const mockBadges = {
  active: [
    {
      name: '花式点赞',
      level: 'unearned',
      emoji: '1f44d',
      shape: 'pentagon',
      category: '活跃成就',
      earned: false,
      description: '在社区内【点赞】100次'
    },
    {
      name: '捧场专家',
      level: 'unearned',
      emoji: '1f4ac',
      shape: 'pentagon',
      category: '活跃成就',
      earned: false,
      description: '在社区内【点赞】500次'
    },
    {
      name: '笔耕不辍',
      level: 'unearned',
      emoji: '1f4dd',
      shape: 'pentagon',
      category: '活跃成就',
      earned: false,
      description: '在社区内【点赞】1000次'
    },
    {
      name: '星之收藏者',
      level: 'unearned',
      emoji: '2b50',
      shape: 'pentagon',
      category: '活跃成就',
      earned: false,
      description: '在社区内【点赞】10000次'
    },
    {
      name: '准时上线',
      level: 'normal',
      emoji: '1f680',
      shape: 'pentagon',
      category: '活跃成就',
      earned: true,
      description: '在社区内【连续登录】3天',
      upgradable: true,
      giftBadge: true
    },
    {
      name: '超能待机王',
      level: 'unearned',
      emoji: '1f6a2',
      shape: 'pentagon',
      category: '活跃成就',
      earned: false,
      description: '在社区内【点赞】10次'
    }
  ],
  social: [
    {
      name: '赞爆了',
      level: 'unearned',
      emoji: '1f44d',
      shape: 'circle',
      category: '社交影响',
      earned: false
    },
    {
      name: '超能偶像',
      level: 'unearned',
      emoji: '1f451',
      shape: 'circle',
      category: '社交影响',
      earned: false
    }
  ],
  spread: [
    {
      name: '引流之主',
      level: 'unearned',
      emoji: '1f4e2',
      shape: 'circle',
      category: '互动传播',
      earned: false
    },
    {
      name: '关注你了',
      level: 'unearned',
      emoji: '2764',
      shape: 'circle',
      category: '互动传播',
      earned: false
    }
  ]
}

export const mockUserBadges = [
  {
    name: '准时上线',
    level: 'normal',
    emoji: '1f680',
    earned: true,
    upgradable: true
  }
]

export const mockRewards = [
  {
    name: '灵石',
    icon: '💎',
    qty: 10
  },
  {
    name: '金锭',
    icon: '🏅',
    qty: 5
  },
  {
    name: '元宝',
    icon: '💰',
    qty: 3
  },
  {
    name: '丹玉',
    icon: '🟢',
    qty: 2
  },
  {
    name: '深海龙头像',
    icon: '🖼️',
    qty: 1
  }
]
