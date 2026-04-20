// 游戏社区模拟数据
const mockData = {
  // 当前用户
  currentUser: {
    id: '001',
    username: 'dbpei008',
    avatar: 'https://opsoss.q1.com/club/avatar/2023/01/06/1672984017367_069a1712-8db1-486b-9639-52e5a2bf3d59.jpg',
    level: 150,
    vip: 8,
    points: 8888,
    rubies: 5000,
    fans: 1234,
    following: 567,
    posts: 89,
    bio: '超能世界的冒险者'
  },

  // 游戏信息
  gameInfo: {
    name: '妖神记',
    logo: 'https://opsoss.q1.com/CLUB/2024/01/03/1704266966028a7b3e1d3-3dc0-472d-a900-ac90578929e4.jpg',
    totalPosts: 10000,
    latestVersion: 'v2.4.1'
  },

  // 首页内容
  homepage: {
    stats: [
      { label: '总帖子', value: '1万', icon: '📝' },
      { label: '在线玩家', value: '12.5K', icon: '👥' },
      { label: '今日热议', value: '288', icon: '🔥' }
    ],
    hotTopics: [
      {
        id: 1,
        title: '新英雄罗莎琳德异界试炼通关阵容分享推荐',
        cover: 'https://opsoss.q1.com/club/images/2026/03/29/1774764915128_3e09aa58-9f41-4738-a06e-fce62281e69d.jpg',
        author: '伯库林',
        level: 131,
        likes: 38,
        comments: 8,
        views: 450
      },
      {
        id: 2,
        title: '【维护公告】3月31日&4月1日维护更新公告',
        cover: 'https://opsoss.q1.com/club/images/2026/03/26/1774853212372_da6d63c4-9966-4363-a64c-63d3c64065fc_428565.jpg',
        author: '聂离',
        level: 150,
        likes: 16,
        comments: 7,
        views: 320
      }
    ],
    banners: [
      {
        id: 1,
        title: '国庆盛典火热进行中',
        image: 'https://opsoss.hnsz168.cn/CLUB/2026/03/27/1773728166870201aab81-72a8-4852-a29a-96ca0363668e.jpg',
        link: '#'
      }
    ]
  },

  // 资讯列表
  news: [
    {
      id: 'news_001',
      title: '妖神情报站 | 烟花齐放，万人同乐，一起参加国庆盛典！',
      author: '聂离',
      authorLevel: 150,
      avatar: 'https://opsoss.q1.com/club/avatar/2022/11/22/1669113940067_feee8425-a91b-47e4-bacc-ab67cd262679.png',
      cover: 'https://opsoss.q1.com/club/images/2024/09/19/1726796473771_4cca4887-30eb-4743-b8e9-e6bf8e353a8f_423966.png',
      likes: 33,
      comments: 14,
      views: 520,
      date: '09/20',
      category: '官方公告',
      content: '妖神记国庆盛典火热进行中，万人同乐，共迎国庆！精彩活动等你来参与。'
    },
    {
      id: 'news_002',
      title: '【社区版本更新】V2.4.1版本更新介绍',
      author: '聂离',
      authorLevel: 150,
      avatar: 'https://opsoss.q1.com/club/avatar/2022/11/22/1669113940067_feee8425-a91b-47e4-bacc-ab67cd262679.png',
      cover: 'https://opsoss.q1.com/club/images/2024/09/12/1726138270700_3fe50b1c-bf52-4a17-ac2d-5028257c6de8_146409.jpg',
      likes: 26,
      comments: 3,
      views: 380,
      date: '09/12',
      category: '版本更新',
      content: '社区2.4.1版本已正式上线，带来全新功能和优化体验。'
    },
    {
      id: 'news_003',
      title: '新英雄罗莎琳德异界试炼通关阵容分享推荐',
      author: '伯库林',
      authorLevel: 131,
      avatar: 'https://opsoss.q1.com/club/avatar/2023/04/21/1682036744718_6703b726-d02a-4ea7-8ec6-bc6559a80cd9.jpeg',
      cover: 'https://opsoss.q1.com/club/images/2026/03/29/1774764915128_3e09aa58-9f41-4738-a06e-fce62281e69d.jpg',
      likes: 38,
      comments: 8,
      views: 450,
      date: '03/29',
      category: '攻略分享',
      content: '新英雄罗莎琳德异界试炼攻略来啦！附最优阵容配置。'
    }
  ],

  // 玩家圈帖子
  posts: [
    {
      id: 'post_001',
      title: '妖神记不为人知的小知识',
      author: '妖神38服白嫖到关服',
      authorLevel: 85,
      avatar: 'https://opsoss.q1.com/club/avatar/2022/12/16/1671192782141_65fccc1b-f0b7-49bf-972f-6cbf33c60c35.jpeg',
      cover: 'https://opsoss.q1.com/club/images/2023/07/04/1688480500787_17fa7411-8d7b-47c1-9c69-d112fc7c2493_381156.jpeg',
      likes: 229,
      comments: 47,
      views: 1200,
      date: '3天前',
      category: '攻略',
      content: '我是妖神服38区永恒神殿宗会的白嫖到关服，今天跟大家带来一些妖神记不为人知的小知识...',
      tags: ['攻略', '分享', '小知识']
    },
    {
      id: 'post_002',
      title: '板绘——水之灵神(高考特别版)',
      author: '旋律',
      authorLevel: 120,
      avatar: 'https://opsoss.q1.com/club/avatar/2023/04/24/1682273688227_14f2f9f4-37b9-4c17-a9dc-4cfb55df04a4.jpg',
      cover: 'https://opsoss.q1.com/club/images/2023/06/12/1686550033873_2c528ec8-bfff-417c-bcf6-fd1d911cb71d_3004633.png',
      likes: 273,
      comments: 29,
      views: 1580,
      date: '3年前',
      category: '二次创作',
      content: '高考特别版的水之灵神板绘作品...',
      tags: ['二次创作', '板绘', '角色']
    },
    {
      id: 'post_003',
      title: '聂离和妖主的纠葛 上篇',
      author: '阑絮想飞',
      authorLevel: 110,
      avatar: 'https://opsoss.q1.com/club/avatar/2023/05/11/1683812295685_a945844d-cb4f-4d2b-bf5d-bf876dd7237b.jpg',
      cover: 'https://opsoss.q1.com/club/images/2023/06/06/1686015031935_9f18f0d2-7906-4eb2-926b-e8ef74ed47fa_441923.jpg',
      likes: 189,
      comments: 36,
      views: 980,
      date: '3年前',
      category: '讨论',
      content: '大家好，今天来聊聊小说中聂离和妖主之间的纠葛...',
      tags: ['故事分析', '剧情', '人物']
    }
  ],

  // 评论
  comments: [
    {
      id: 'comment_001',
      postId: 'post_001',
      author: '克己修心',
      authorLevel: 144,
      avatar: 'https://opsoss.q1.com/club/avatar/2023/05/31/1685513969588_85557be1-c860-436c-984b-eac6c69e3c82.jpg',
      content: '太有用了！学到了很多新知识！',
      likes: 12,
      date: '2小时前'
    },
    {
      id: 'comment_002',
      postId: 'post_001',
      author: '天边彩虹',
      authorLevel: 92,
      avatar: 'https://opsoss.q1.com/club/avatar/2025/04/14/1744640698851_af1754f7-c994-4a51-b518-50a26e70fa43.jpg',
      content: '感谢分享，这些技巧确实有帮助！',
      likes: 8,
      date: '4小时前'
    }
  ]
};

// 需求文档
const requirements = [
  {
    title: '首页',
    items: [
      '社区统计数据展示',
      '热门话题卡片',
      '轮播图/活动banner',
      '用户个人信息卡',
      '快速入口菜单'
    ]
  },
  {
    title: '资讯',
    items: [
      '官方资讯列表',
      '分类筛选',
      '搜索功能',
      '资讯详情页',
      '评论系统'
    ]
  },
  {
    title: '玩家圈',
    items: [
      '帖子列表展示',
      '分类/标签筛选',
      '发帖按钮',
      '帖子详情页',
      '评论回复'
    ]
  },
  {
    title: '发帖',
    items: [
      '标题输入框',
      '分类选择',
      '内容编辑器',
      '标签添加',
      '图片上传'
    ]
  },
  {
    title: '我的',
    items: [
      '个人资料卡',
      '等级/勋章展示',
      '资产统计',
      '我的发帖',
      '我的收藏',
      '我的评论'
    ]
  }
];
