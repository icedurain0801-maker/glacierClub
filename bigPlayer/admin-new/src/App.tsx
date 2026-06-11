import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Badge, ConfigProvider, Input, Layout, Tooltip } from 'antd'
import {
  BellOutlined,
  ClockCircleOutlined,
  DownOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons'
import Sidebar, { getCurrentRouteMeta } from './layout/Sidebar'

// Appearance
import ClubAppearance from '../club/appearance'

// Badge
import BadgeList from '../club/badge/list'
import BadgeCategory from '../club/badge/category'

// Banner
import BannerList from '../club/banner/list'

// Board
import BoardList from '../club/board/list'

// Content
import ContentPostList from '../club/content/post/list'
import ContentCommentList from '../club/content/comment/list'
import ContentCoordinatorList from '../club/content/coordinator/list'
import ContentRecycleBin from '../club/content/recycleBin/list'

// Creator
import CreatorList from '../club/creator/list'
import CreatorTask from '../club/creator/task'

// Emotions
import EmotionsList from '../club/emotions'

// Encyclopedia
import EncyclopediaList from '../club/encyclopedia/list'

// Log
import LogReport from '../club/log/report'

// Lottery
import LotteryList from '../club/lottery/list'
import LotteryLog from '../club/lottery/log'
import LotteryCreate from '../club/lottery/create'

// Push
import PushMessage from '../club/push/message'
import PushCreate from '../club/push/message/create'

// Statistics
import Statistics from '../club/statistics'

// Topic
import TopicList from '../club/topic'

// User
import UserList from '../club/user/list'
import UserAvatar from '../club/user/avatar'
import UserNickName from '../club/user/nickName'
import UserTag from '../club/user/tag'
import UserTagSetting from '../club/user/tagSetting'
import UserAiQuality from '../club/user/aiQuality'
import UserAiMessage from '../club/user/aiMessage'
import UserLargeModelParameter from '../club/user/largeModelParameter'

import './App.less'

const { Sider, Content } = Layout

const platformNav = [
  '游戏运营后台',
  '自动化运维',
  '自动化部署',
  'SDK 管理后台',
  '会员管理后台',
  '数据分析',
  '客服后台',
  '活动管理系统',
  '聊天系统',
  '联合业务后台',
  '开放平台',
  '通用配置',
]

function PlatformTopbar() {
  return (
    <div className="platform-topbar">
      <div className="platform-brand">
        <span className="platform-brand-mark">冰</span>
        <span className="platform-brand-title">冰川业务平台</span>
      </div>
      <nav className="platform-nav">
        {platformNav.map(item => (
          <span key={item} className={item === '游戏运营后台' ? 'platform-nav-item active' : 'platform-nav-item'}>
            {item}
          </span>
        ))}
      </nav>
    </div>
  )
}

function WorkspaceHeader() {
  const location = useLocation()
  const routeMeta = getCurrentRouteMeta(location.pathname)
  const breadcrumb = [...routeMeta.groups, routeMeta.title].filter(Boolean).join(' / ')

  return (
    <div className="workspace-header">
      <div className="workspace-left">
        <Tooltip title="折叠菜单">
          <button className="workspace-icon-btn" type="button" aria-label="折叠菜单">
            <MenuFoldOutlined />
          </button>
        </Tooltip>
        <Tooltip title="刷新">
          <button className="workspace-icon-btn" type="button" aria-label="刷新" onClick={() => window.location.reload()}>
            <ReloadOutlined />
          </button>
        </Tooltip>
        <div className="workspace-route-tab">
          <span>{routeMeta.title}</span>
        </div>
        <span className="workspace-breadcrumb">{breadcrumb}</span>
      </div>
      <div className="workspace-tools">
        <Input
          className="workspace-search"
          prefix={<SearchOutlined />}
          placeholder="输入功能名称"
          suffix={<span className="workspace-shortcut">Ctrl K</span>}
          allowClear
        />
        <span className="workspace-tool">
          <QuestionCircleOutlined />
          帮助
        </span>
        <span className="workspace-tool">
          <GlobalOutlined />
          简体
        </span>
        <span className="workspace-tool">
          <ClockCircleOutlined />
          UTC+8
        </span>
        <Badge count={12} size="small" offset={[2, -1]}>
          <span className="workspace-tool workspace-tool-icon">
            <BellOutlined />
          </span>
        </Badge>
        <span className="workspace-user">
          <span className="workspace-user-avatar">
            <UserOutlined />
          </span>
          刘福敏
          <DownOutlined className="workspace-user-arrow" />
        </span>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 4,
          fontSize: 13,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Arial, sans-serif",
        },
        components: {
          Menu: {
            darkItemBg: 'transparent',
            darkSubMenuItemBg: '#00111d',
            darkItemColor: 'rgba(216, 231, 245, 0.82)',
            darkItemHoverBg: '#062139',
            darkItemHoverColor: '#ffffff',
            darkItemSelectedBg: '#1890ff',
            darkItemSelectedColor: '#ffffff',
            itemBorderRadius: 4,
            itemMarginBlock: 2,
            itemMarginInline: 4,
          },
        },
      }}
    >
      <Layout className="admin-shell">
        <PlatformTopbar />
        <Layout className="admin-shell-body">
          <Sider className="app-sidebar" width={214} theme="dark">
            <Sidebar />
          </Sider>
          <Layout className="app-workspace">
            <WorkspaceHeader />
            <Content className="app-content">
              <div className="app-page-frame">
                <Routes>
                  <Route path="/" element={<Navigate to="/club/appearance" replace />} />

                  {/* Appearance */}
                  <Route path="/club/appearance" element={<ClubAppearance />} />

                  {/* Badge */}
                  <Route path="/club/badge/list" element={<BadgeList />} />
                  <Route path="/club/badge/category" element={<BadgeCategory />} />

                  {/* Banner */}
                  <Route path="/club/banner" element={<BannerList />} />

                  {/* Board */}
                  <Route path="/club/board" element={<BoardList />} />

                  {/* Content */}
                  <Route path="/club/content/post" element={<ContentPostList />} />
                  <Route path="/club/content/comment" element={<ContentCommentList />} />
                  <Route path="/club/content/coordinator" element={<ContentCoordinatorList />} />
                  <Route path="/club/content/recycle" element={<ContentRecycleBin />} />

                  {/* Creator */}
                  <Route path="/club/creator" element={<CreatorList />} />
                  <Route path="/club/creator/task" element={<CreatorTask />} />

                  {/* Emotions */}
                  <Route path="/club/emotions" element={<EmotionsList />} />

                  {/* Encyclopedia */}
                  <Route path="/club/encyclopedia" element={<EncyclopediaList />} />

                  {/* Log */}
                  <Route path="/club/log/report" element={<LogReport />} />

                  {/* Lottery */}
                  <Route path="/club/lottery" element={<LotteryList />} />
                  <Route path="/club/lottery/log" element={<LotteryLog />} />
                  <Route path="/club/lottery/create" element={<LotteryCreate />} />
                  <Route path="/club/lottery/:type/:id" element={<LotteryCreate />} />

                  {/* Push */}
                  <Route path="/club/push/message" element={<PushMessage />} />
                  <Route path="/club/push/create" element={<PushCreate />} />
                  <Route path="/club/push/edit/:editId" element={<PushCreate />} />
                  <Route path="/club/push/copy/:copyId" element={<PushCreate />} />

                  {/* Statistics */}
                  <Route path="/club/statistics" element={<Statistics />} />

                  {/* Topic */}
                  <Route path="/club/topic" element={<TopicList />} />

                  {/* User */}
                  <Route path="/club/user" element={<UserList />} />
                  <Route path="/club/user/avatar" element={<UserAvatar />} />
                  <Route path="/club/user/nickname" element={<UserNickName />} />
                  <Route path="/club/user/tag" element={<UserTag />} />
                  <Route path="/club/user/tag-setting" element={<UserTagSetting />} />
                  <Route path="/club/user/ai-quality" element={<UserAiQuality />} />
                  <Route path="/club/user/ai-message" element={<UserAiMessage />} />
                  <Route path="/club/user/large-model" element={<UserLargeModelParameter />} />
                </Routes>
              </div>
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </ConfigProvider>
  )
}
