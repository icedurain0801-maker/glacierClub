import type { ReactNode } from 'react'
import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  AppstoreOutlined,
  BarChartOutlined,
  BellOutlined,
  CommentOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  GiftOutlined,
  MessageOutlined,
  NotificationOutlined,
  PictureOutlined,
  RobotOutlined,
  SettingOutlined,
  TagsOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons'

interface NavigationItem {
  key: string
  label: string
  icon?: ReactNode
  children?: NavigationItem[]
}

interface RouteMeta {
  path: string
  title: string
  groups: string[]
}

export const navigationItems: NavigationItem[] = [
  {
    key: 'club-config',
    label: '社区配置',
    icon: <SettingOutlined />,
    children: [
      { key: '/club/appearance', label: '装扮管理', icon: <AppstoreOutlined /> },
      {
        key: 'badge',
        label: '徽章管理',
        icon: <TrophyOutlined />,
        children: [
          { key: '/club/badge/list', label: '徽章列表' },
          { key: '/club/badge/category', label: '徽章分类' },
        ],
      },
      { key: '/club/banner', label: 'Banner 管理', icon: <PictureOutlined /> },
      { key: '/club/board', label: '版块管理', icon: <DatabaseOutlined /> },
    ],
  },
  {
    key: 'club-content',
    label: '内容管理',
    icon: <FileSearchOutlined />,
    children: [
      { key: '/club/content/post', label: '帖子管理', icon: <MessageOutlined /> },
      { key: '/club/content/comment', label: '评论管理', icon: <CommentOutlined /> },
      { key: '/club/content/coordinator', label: '协管员申请管理' },
      { key: '/club/content/recycle', label: '回收站' },
    ],
  },
  {
    key: 'club-operation',
    label: '运营工具',
    icon: <GiftOutlined />,
    children: [
      {
        key: 'creator',
        label: '创作者管理',
        children: [
          { key: '/club/creator', label: '创作者列表' },
          { key: '/club/creator/task', label: '创作者任务' },
        ],
      },
      { key: '/club/emotions', label: '表情管理' },
      { key: '/club/encyclopedia', label: '百科管理' },
      { key: '/club/topic', label: '话题管理', icon: <TagsOutlined /> },
      {
        key: 'lottery',
        label: '抽奖管理',
        children: [
          { key: '/club/lottery', label: '抽奖列表' },
          { key: '/club/lottery/log', label: '抽奖记录' },
        ],
      },
      {
        key: 'push',
        label: '应用推送',
        icon: <NotificationOutlined />,
        children: [{ key: '/club/push/message', label: '消息推送' }],
      },
    ],
  },
  {
    key: 'club-user-data',
    label: '用户与数据',
    icon: <TeamOutlined />,
    children: [
      { key: '/club/user', label: '用户管理', icon: <UserOutlined /> },
      { key: '/club/user/avatar', label: '头像审核' },
      { key: '/club/user/nickname', label: '昵称审核' },
      { key: '/club/user/tag', label: '用户标签' },
      { key: '/club/user/tag-setting', label: '标签设置' },
      { key: '/club/user/ai-quality', label: 'AI质检', icon: <RobotOutlined /> },
      { key: '/club/user/ai-message', label: 'AI消息' },
      { key: '/club/user/large-model', label: '大模型参数' },
      { key: '/club/statistics', label: '数据统计', icon: <BarChartOutlined /> },
      { key: '/club/log/report', label: '举报日志', icon: <BellOutlined /> },
    ],
  },
]

function toMenuItems(items: NavigationItem[]): MenuProps['items'] {
  return items.map(item => ({
    key: item.key,
    icon: item.icon,
    label: item.label,
    children: item.children ? toMenuItems(item.children) : undefined,
  }))
}

function collectOpenKeys(items: NavigationItem[]): string[] {
  return items.flatMap(item => (item.children?.length ? [item.key, ...collectOpenKeys(item.children)] : []))
}

function collectRouteMeta(items: NavigationItem[], groups: string[] = []): RouteMeta[] {
  return items.flatMap(item => {
    const isRoute = item.key.startsWith('/')
    const nextGroups = isRoute ? groups : [...groups, item.label]
    const current = isRoute ? [{ path: item.key, title: item.label, groups }] : []

    return [...current, ...(item.children ? collectRouteMeta(item.children, nextGroups) : [])]
  })
}

const menuItems = toMenuItems(navigationItems)
const defaultOpenKeys = collectOpenKeys(navigationItems)
const routeMeta = collectRouteMeta(navigationItems)

export function getCurrentRouteMeta(pathname: string): RouteMeta {
  const normalized = pathname.replace(/\/$/, '') || '/'
  const exact = routeMeta.find(item => item.path === normalized)
  if (exact) {
    return exact
  }

  // Secondary routes should keep the parent menu highlighted, while showing a more precise title.
  const pushParent = routeMeta.find(item => item.path === '/club/push/message') || {
    path: '/club/push/message',
    title: '消息推送',
    groups: ['运营工具', '应用推送'],
  }
  if (normalized === '/club/push/create') {
    return { ...pushParent, title: '新增消息' }
  }
  if (normalized.startsWith('/club/push/edit/')) {
    return { ...pushParent, title: '编辑消息' }
  }
  if (normalized.startsWith('/club/push/copy/')) {
    return { ...pushParent, title: '复制消息' }
  }

  const lotteryParent = routeMeta.find(item => item.path === '/club/lottery') || {
    path: '/club/lottery',
    title: '抽奖列表',
    groups: ['运营工具', '抽奖管理'],
  }
  if (normalized === '/club/lottery/create') {
    return { ...lotteryParent, title: '新增抽奖' }
  }
  const lotteryMatch = normalized.match(/^\/club\/lottery\/([^/]+)\/([^/]+)$/)
  if (lotteryMatch) {
    const type = lotteryMatch[1]
    const titleMap: Record<string, string> = {
      edit: '编辑抽奖',
      copy: '复制抽奖',
      audit: '审核抽奖',
      detail: '抽奖详情',
    }

    return { ...lotteryParent, title: titleMap[type] || '抽奖详情' }
  }

  const prefixMatch = routeMeta
    .filter(item => normalized.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]

  return prefixMatch || routeMeta[0]
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const activeMeta = getCurrentRouteMeta(location.pathname)

  return (
    <div className="app-sidebar-panel">
      <div className="sidebar-product">
        <span className="sidebar-product-mark">M</span>
        <span className="sidebar-product-title">游戏运营后台</span>
      </div>
      <Menu
        className="app-sidebar-menu"
        mode="inline"
        theme="dark"
        inlineIndent={18}
        selectedKeys={[activeMeta.path]}
        defaultOpenKeys={defaultOpenKeys}
        items={menuItems}
        onClick={e => {
          if (String(e.key).startsWith('/')) {
            navigate(e.key)
          }
        }}
      />
    </div>
  )
}
