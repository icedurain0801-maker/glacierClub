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
        label: '首页',
        children: []
      },
      {
        type: 'dir',
        label: '资讯',
        children: []
      },
      {
        type: 'dir',
        label: '玩家圈',
        children: []
      },
      {
        type: 'dir',
        label: '个人中心',
        children: [
          {
            type: 'dir',
            label: '个性装扮',
            children: [
              {
                type: 'dir',
                label: '徽章墙',
                children: [
                  {
                    type: 'item',
                    label: '徽章墙',
                    version: 'v3.0.9',
                    href: 'client/profile/personalization/Badge.html'
                  },
                  {
                    type: 'item',
                    label: '徽章获得通知',
                    version: 'v3.0.9',
                    href: 'client/profile/personalization/Badge.html',
                    screenId: 's5'
                  },
                  {
                    type: 'item',
                    label: '角色信息确认',
                    version: 'v3.0.9',
                    href: 'client/profile/personalization/Badge.html',
                    screenId: 's6'
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        type: 'dir',
        label: '帖子详情',
        children: []
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
        children: []
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
                version: 'v3.0.9',
                href: 'admin/community/BadgeManage.html'
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
        children: []
      },
      {
        type: 'dir',
        label: '版块管理',
        children: []
      }
    ]
  }
];
