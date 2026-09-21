/**
 * 大玩家 — 侧边导航目录数据
 *
 * 结构说明：
 *   type: 'group'   — 顶级分组标题（不可点击）
 *   type: 'dir'     — 目录节点（可折叠，包含 children）
 *   type: 'item'    — 叶节点（可点击，跳转页面）
 *
 * item.href        — 相对于 bigPlayer/ 根目录的页面路径
 * item.version     — 当前版本号，显示在右侧
 * item.screenId    — (可选) 页面内 screen 的 id，点击侧边栏时自动切换到该页面
 */
const SIDEBAR_DATA = [
  {
    type: 'group',
    label: '概览',
    children: [
      {
        type: 'item',
        label: '文档修改记录',
        version: '',
        href: 'changelog.html'
      }
    ]
  },
  {
    type: 'group',
    label: 'C端',
    children: [
      {
        type: 'dir',
        label: '首页模块',
        children: [
          {
            type: 'item',
            label: '首页（社区主页）',
            version: 'v3.1.4',
            href: 'client/domestic/home/home.html'
          },
          {
            type: 'item',
            label: '帖子详情',
            version: '',
            href: 'client/domestic/home/post-detail.html'
          },
          {
            type: 'item',
            label: '心情详情',
            version: '',
            href: 'client/domestic/home/mood-detail.html'
          },
          {
            type: 'item',
            label: '搜索页',
            version: '',
            href: 'client/domestic/home/search.html'
          },
          {
            type: 'item',
            label: '搜索结果页',
            version: '',
            href: 'client/domestic/home/search-results.html'
          },
          {
            type: 'item',
            label: '福利任务',
            version: 'v3.1.4',
            href: 'client/domestic/home/WelfareTask.html'
          }
        ]
      },
      {
        type: 'dir',
        label: '动态模块',
        children: [
          {
            type: 'item',
            label: '动态流',
            version: '',
            href: 'client/domestic/news/news_feed.html'
          }
        ]
      },
      {
        type: 'dir',
        label: '个人中心',
        children: [
          {
            type: 'item',
            label: '我的主页',
            version: '',
            href: 'client/domestic/profile/profile.html'
          },
          {
            type: 'item',
            label: '他人主页',
            version: '',
            href: 'client/domestic/profile/player.html'
          },
          {
            type: 'item',
            label: '设置页',
            version: '',
            href: 'client/domestic/profile/settings.html'
          },
          {
            type: 'item',
            label: '通知页',
            version: '',
            href: 'client/domestic/home/notifications.html'
          },
          {
            type: 'item',
            label: '聊天页',
            version: '',
            href: 'client/domestic/home/chat.html'
          },
          {
            type: 'item',
            label: '草稿箱',
            version: '',
            href: 'client/domestic/publish/drafts.html'
          }
        ]
      },
      {
        type: 'dir',
        label: '发布模块',
        children: [
          {
            type: 'item',
            label: '发帖页',
            version: '',
            href: 'client/domestic/publish/post_publish.html'
          },
          {
            type: 'item',
            label: '发心情页',
            version: '',
            href: 'client/domestic/publish/mood_publish.html'
          }
        ]
      }
    ]
  },
  {
    type: 'group',
    label: '后台管理',
    children: [
      {
        type: 'dir',
        label: '内容管理',
        children: [
          {
            type: 'item',
            label: '官网展示',
            version: '',
            href: 'admin/official-website/index.html'
          }
        ]
      },
      {
        type: 'dir',
        label: '内容治理',
        children: [
          {
            type: 'item',
            label: '灌水判定配置',
            version: 'v3.1.3',
            href: 'admin/content-governance/SpamRuleConfig.html'
          }
        ]
      },
      {
        type: 'dir',
        label: '社区功能',
        children: [
          {
            type: 'dir',
            label: '徽章管理',
            children: [
              {
                type: 'item',
                label: '徽章管理',
                version: 'v3.0.9',
                href: 'admin/community/BadgeManage.html'
              },
              {
                type: 'item',
                label: '徽章分类管理',
                href: 'admin/community/BadgeManage.html',
                screenId: 'category'
              }
            ]
          },
          {
            type: 'dir',
            label: '攻略站管理',
            children: [
              {
                type: 'item',
                label: '攻略组管理',
                version: 'v3.1.0',
                href: 'admin/community/GuideGroupManage.html'
              }
            ]
          },
          {
            type: 'dir',
            label: '楼层抽奖管理',
            children: [
              {
                type: 'item',
                label: '楼层抽奖',
                version: 'v3.1.0',
                href: 'admin/community/FloorLotteryManage.html'
              }
            ]
          }
        ]
      },
      {
        type: 'dir',
        label: '用户管理',
        children: []
      },
      {
        type: 'dir',
        label: '日志管理',
        children: []
      },
      {
        type: 'dir',
        label: '数据分析',
        children: [
          {
            type: 'item',
            label: '用户数据分析',
            version: 'v3.1.1',
            href: 'admin/analytics/UserDataAnalysis.html'
          }
        ]
      },
      {
        type: 'dir',
        label: '版块管理',
        children: []
      }
    ]
  }
];
