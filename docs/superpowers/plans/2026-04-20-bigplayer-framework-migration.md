# bigPlayer 框架迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 bigPlayer/client 的 HTML 原型迁移到 UniApp，bigPlayer/admin 迁移到 React，保持三列布局外壳，原型展示用途不变。

**Architecture:** 
- **Client 端**：UniApp (Vue 3 + Vite) 独立项目，pages.json 路由，Tailwind 样式
- **Admin 端**：React (Vite) 独立项目，react-router 路由，原生 CSS 样式
- **外壳层**：两套 prototype-shell/index.html，分别通过 iframe 嵌入各自的 dev server，sidebar 和文档面板复用 shared/ 资源，postMessage 通信

**Tech Stack:** 
- UniApp 3 + Vue 3 + Vite + Tailwind CSS (@uni-helper/vite-plugin-uni-tailwind)
- React 18 + Vite + react-router-dom v6
- Node 22, npm 10

---

## Part A：Client 端 — UniApp 项目初始化

### Task 1: UniApp 项目骨架

**Files:**
- Create: `bigPlayer/client/package.json`
- Create: `bigPlayer/client/vite.config.js`
- Create: `bigPlayer/client/pages.json`
- Create: `bigPlayer/client/manifest.json`
- Create: `bigPlayer/client/uni.scss`
- Create: `bigPlayer/client/main.js`
- Create: `bigPlayer/client/App.vue`
- Create: `bigPlayer/client/.gitignore`

- [ ] **Step 1: Create package.json with dependencies**

```json
{
  "name": "bigplayer-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev:h5": "uni -p h5",
    "build:h5": "uni build -p h5",
    "build:app": "uni build -p app"
  },
  "dependencies": {
    "vue": "^3.3.4",
    "@dcloudio/uni-app": "^3.0.0-alpha-3080824",
    "@dcloudio/uni-ui": "^1.4.24"
  },
  "devDependencies": {
    "@dcloudio/uni-cli": "^3.0.0-alpha-3080824",
    "@dcloudio/vite-plugin-uni": "^0.14.5",
    "@uni-helper/vite-plugin-uni-tailwind": "^1.0.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.3.0"
  }
}
```

- [ ] **Step 2: Create vite.config.js**

```javascript
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { UniBuildPlugin } from '@dcloudio/vite-plugin-uni'
import uniTailwindPlugin from '@uni-helper/vite-plugin-uni-tailwind'

export default defineConfig({
  plugins: [
    uni(),
    uniTailwindPlugin({
      minified: false
    })
  ],
  server: {
    port: 5173,
    host: 'localhost'
  }
})
```

- [ ] **Step 3: Create pages.json**

```json
{
  "pages": [
    {
      "path": "pages/home/home",
      "style": {
        "navigationBarTitleText": "首页"
      }
    },
    {
      "path": "pages/profile/personalization/Badge",
      "style": {
        "navigationBarTitleText": "徽章墙"
      }
    }
  ],
  "globalStyle": {
    "navigationBarTextStyle": "white",
    "navigationBarBackgroundColor": "#3ab4e8"
  }
}
```

- [ ] **Step 4: Create manifest.json**

```json
{
  "name": "大玩家社区",
  "appid": "__UNI__PLACEHOLDER__",
  "description": "游戏社区原型",
  "versionName": "1.0.0",
  "versionCode": 100,
  "transformPx": false,
  "app-plus": {
    "usingComponents": true
  },
  "h5": {
    "title": "大玩家社区"
  }
}
```

- [ ] **Step 5: Create uni.scss with color variables**

```scss
// 主色彩
$primary: #3ab4e8;
$primary-gradient: linear-gradient(180deg, #3ab4e8 0%, #5ec8f0 40%, #c8e8f8 80%, #eaf4fb 100%);
$bg: #f0f6fb;
$bg-surface: #ffffff;
$bg-surface-container: #e8eff3;
$bg-surface-container-low: #f0f4f7;
$bg-surface-container-highest: #d9e4ea;

// 文字色
$text-primary: #1a2233;
$text-secondary: #555;
$text-tertiary: #888;
$text-hint: #aaa;

// 功能色
$success: #2ec87a;
$warning: #ff9500;
$danger: #ff4d4f;
$error: #ff6b35;

// 边框
$border-color: #e8ecf0;
$border-light: #f0f0f0;
```

- [ ] **Step 6: Create main.js entry point**

```javascript
import { createSSRApp } from 'vue'
import App from './App.vue'

export function createApp() {
  const app = createSSRApp(App)
  return {
    app
  }
}
```

- [ ] **Step 7: Create App.vue root component**

```vue
<template>
  <view class="min-h-screen bg-gradient-to-b from-primary to-bg">
    <router-view />
  </view>
</template>

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  // postMessage ready
  window.parent?.postMessage({ type: 'appReady' }, '*')
})
</script>

<style>
* {
  box-sizing: border-box;
}

body, html {
  margin: 0;
  padding: 0;
}
</style>
```

- [ ] **Step 8: Create .gitignore**

```
node_modules/
dist/
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
.env.local
```

- [ ] **Step 9: Run npm install and verify**

```bash
cd bigPlayer/client
npm install
```

Expected: No errors, node_modules created

- [ ] **Step 10: Commit**

```bash
git add bigPlayer/client/
git commit -m "feat(client): init UniApp project scaffold

- Add Vite + uni-app configuration
- Setup Tailwind CSS plugin
- Create pages.json routing
- Add color variables to uni.scss

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Client 端公共组件 — NavBar.vue

**Files:**
- Create: `bigPlayer/client/components/NavBar.vue`

- [ ] **Step 1: Create NavBar.vue**

```vue
<template>
  <view class="sticky top-0 w-full z-[100] bg-white/5 backdrop-blur-sm flex justify-between items-center px-6 h-16" 
        :style="{ background: 'linear-gradient(180deg, rgba(58,180,232,0.95) 0%, rgba(94,200,240,0.9) 100%)' }">
    <view class="flex items-center gap-2">
      <text class="text-white text-lg font-bold tracking-tight drop-shadow-sm">{{ title }}</text>
    </view>
    <view v-if="showBack" class="text-white text-[22px] leading-none cursor-pointer w-7 flex-shrink-0" @click="goBack">
      ‹
    </view>
  </view>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '首页'
  },
  showBack: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['back'])

const goBack = () => {
  emit('back')
}
</script>

<style scoped>
</style>
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/client/components/NavBar.vue
git commit -m "feat(client/components): add NavBar component

- Navigation bar with title and optional back button
- Gradient blue background with shadow

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Client 端公共组件 — BadgeIcon.vue

**Files:**
- Create: `bigPlayer/client/components/BadgeIcon.vue`

- [ ] **Step 1: Create BadgeIcon.vue**

```vue
<template>
  <view class="flex flex-col items-center gap-1.5">
    <view class="relative w-[72px] h-[72px] flex-shrink-0">
      <view :class="['w-[72px]', 'h-[72px]', 'flex', 'items-center', 'justify-center', 'text-white', shapeClass, gradientClass]">
        <text class="text-4xl">{{ emoji }}</text>
      </view>
      <view v-if="showGiftBadge" class="absolute top-0 left-0 w-5 h-5 flex items-center justify-center leading-none">
        <image src="@/static/gift-box.svg" class="w-5 h-5" />
      </view>
      <view v-if="upgradable" class="absolute top-0 right-0 bg-[#ff9500] text-white text-[10px] px-[5px] py-0.5 rounded-lg whitespace-nowrap font-medium">
        可升级
      </view>
    </view>
    <text class="text-xs text-[#555] text-center">{{ name }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  shape: {
    type: String, // 'pentagon', 'circle', 'hexagon'
    default: 'pentagon'
  },
  level: {
    type: String, // 'normal', 'rare', 'uncommon', 'epic', 'legend', 'unearned'
    default: 'normal'
  },
  name: String,
  emoji: String,
  showGiftBadge: Boolean,
  upgradable: Boolean
})

const shapeClass = computed(() => {
  if (props.shape === 'circle') return 'rounded-full'
  if (props.shape === 'hexagon') return '[clip-path:polygon(50%_0%,93.3%_25%,93.3%_75%,50%_100%,6.7%_75%,6.7%_25%)]'
  // pentagon default
  return '[clip-path:polygon(50%_0%,97%_34%,79%_97%,21%_97%,3%_34%)]'
})

const gradients = {
  normal: 'bg-[linear-gradient(145deg,#c89850_0%,#7a5020_60%,#4a3010_100%)]',
  rare: 'bg-[linear-gradient(145deg,#f5c842_0%,#e09800_100%)]',
  uncommon: 'bg-[linear-gradient(145deg,#b27fdb_0%,#6a1faa_100%)]',
  epic: 'bg-[linear-gradient(145deg,#f07070_0%,#c01010_100%)]',
  legend: 'bg-[linear-gradient(145deg,#70b8ff_0%,#0060d0_100%)]',
  unearned: 'bg-[linear-gradient(145deg,#d4d4d4_0%,#b0b0b0_100%)]'
}

const gradientClass = computed(() => gradients[props.level] || gradients.normal)
</script>
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/client/components/BadgeIcon.vue
git commit -m "feat(client/components): add BadgeIcon component

- Support pentagon, circle, hexagon shapes
- 6 rarity levels with gradients
- Optional gift badge and upgrade indicator

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Client 端公共组件 — RewardPanel.vue

**Files:**
- Create: `bigPlayer/client/components/RewardPanel.vue`

- [ ] **Step 1: Create RewardPanel.vue**

```vue
<template>
  <view v-if="visible" class="w-full mb-4 bg-white/[0.08] rounded-xl px-3 py-2.5" :class="[darkMode ? 'dark' : '']">
    <view class="flex items-center justify-between mb-2">
      <text class="text-[11px] text-white/50">达成可获得</text>
      <text class="text-[10px] text-white/65 border border-white/25 px-2.5 py-0.5 rounded-full cursor-pointer hover:border-white/50 transition-colors" 
            @click="handleClaim">
        领取
      </text>
    </view>
    <view class="flex justify-center gap-2 flex-wrap">
      <view v-for="(reward, idx) in rewards" :key="idx" class="flex flex-col items-center gap-[3px] min-w-[48px]">
        <view class="w-10 h-10 rounded-lg bg-white/[0.12] flex items-center justify-center border border-white/15">
          <text class="text-lg">{{ reward.icon }}</text>
        </view>
        <text class="text-[10px] text-white/60 text-center whitespace-nowrap">{{ reward.name }}</text>
        <text v-if="reward.qty" class="text-[10px] text-white/45 text-center">×{{ reward.qty }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  rewards: {
    type: Array,
    default: () => []
  },
  darkMode: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['claim'])

const visible = ref(true)

const handleClaim = () => {
  visible.value = false
  emit('claim')
}
</script>

<style scoped>
</style>
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/client/components/RewardPanel.vue
git commit -m "feat(client/components): add RewardPanel component

- Display up to 5 rewards (items + avatars)
- Collapsible claim button
- Dark/light mode support

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Client 端工具函数

**Files:**
- Create: `bigPlayer/client/utils/badge.js`
- Create: `bigPlayer/client/utils/mockData.js`

- [ ] **Step 1: Create utils/badge.js**

```javascript
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
```

- [ ] **Step 2: Create utils/mockData.js**

```javascript
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
```

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/client/utils/
git commit -m "feat(client/utils): add badge utilities and mock data

- Badge emoji mapping to CDN URLs
- Badge shape and level constants
- Mock badges and rewards data

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Client 端首页 — pages/home/home.vue

**Files:**
- Create: `bigPlayer/client/pages/home/home.vue`

- [ ] **Step 1: Create pages/home/home.vue**

```vue
<template>
  <view class="flex flex-col min-h-screen bg-gradient-to-b from-primary/20 to-bg">
    <!-- Navigation Bar -->
    <NavBar title="探索中心" :showBack="false" />
    
    <!-- Main Content -->
    <scroll-view scroll-y class="flex-1 px-4 py-3">
      <!-- Banner -->
      <view class="relative w-full rounded-lg overflow-hidden aspect-[16/10] mb-3 shadow-md">
        <image 
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuA-4taa7yNILD_pDldo0bJdy0lsdv-i1fVOXPvzOVNj-euNEZ9T0V9NOusYI5zZb8KOOdEgXsFzG3WiN_Kbc-_zJ_B2QiaB3SWwGbvm0WPq3PruXCe0ZxhqqMM5Q9Gpo1L4X0YoRctabfBCYGoXbqH_sUxNhAr68PYH7qO8TyszakD0NZX3cujuoO0zZ_NxrSyFAXwOxjzKNCi2s3bs5eohJKBGDQLyTuAc3jdbG3sKFgDTuIuDXXbbI577Ts7l-32pJ-lm67VWXFw"
          class="w-full h-full object-cover"
        />
        <view class="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-surface to-transparent"></view>
        <view class="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent"></view>
        <view class="absolute inset-0 flex flex-col justify-center p-6 pt-16">
          <view class="flex justify-between items-center mb-2">
            <text class="text-2xl font-extrabold text-white leading-tight drop-shadow-md">总帖子 55万</text>
            <view class="inline-flex items-center px-3 py-1 rounded-full bg-primary text-white text-xs font-bold shadow-lg">福利任务</view>
          </view>
          <view class="flex items-center gap-2">
            <text class="text-white/90 text-sm font-medium drop-shadow-sm">经验值 92</text>
            <view class="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold shadow-sm">LV2</view>
          </view>
        </view>
      </view>

      <!-- Tab Navigation -->
      <view class="flex items-center gap-8 border-b border-surface-container-high px-1 mb-4 overflow-x-auto">
        <text class="pb-3 text-sm font-medium text-gray-400 flex-shrink-0">关注</text>
        <text class="pb-3 text-sm font-medium text-gray-400 flex-shrink-0">发现</text>
        <text class="pb-3 text-sm font-bold text-primary border-b-2 border-primary flex-shrink-0">推荐</text>
        <text class="pb-3 text-sm font-medium text-gray-400 flex-shrink-0">攻略站</text>
      </view>

      <!-- Hot News Section -->
      <view class="mb-4">
        <view class="flex justify-between items-end mb-3">
          <text class="text-xl font-extrabold">热门快讯</text>
          <text class="text-xs font-bold text-primary">查看全部</text>
        </view>
        <view class="space-y-3">
          <view v-for="(news, idx) in mockNews" :key="idx" class="bg-white p-4 rounded-lg flex gap-4 shadow-sm">
            <view class="flex-1">
              <text class="font-semibold text-sm line-clamp-2 leading-relaxed">{{ news.title }}</text>
              <view class="flex items-center gap-3 text-[10px] text-gray-500 mt-2">
                <view class="px-1.5 py-0.5 bg-surface-container rounded text-primary font-bold">{{ news.tag }}</view>
                <text>{{ news.likes }}k</text>
                <text>{{ news.comments }}</text>
                <text>{{ news.date }}</text>
              </view>
            </view>
            <image :src="news.image" class="w-20 h-20 rounded-lg object-cover" />
          </view>
        </view>
      </view>

      <!-- Recommended Feed -->
      <view>
        <view class="flex justify-between items-center mb-3">
          <text class="text-xl font-extrabold">为您推荐</text>
        </view>
        <view class="space-y-6">
          <view v-for="(post, idx) in mockPosts" :key="idx" class="bg-white rounded-lg p-5 shadow-sm">
            <view class="flex justify-between items-start gap-3 mb-3">
              <view class="flex items-start gap-3 flex-1">
                <image :src="post.avatar" class="w-10 h-10 rounded-full" />
                <view>
                  <view class="flex items-center gap-2">
                    <text class="text-sm font-bold">{{ post.author }}</text>
                    <view class="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{{ post.level }}</view>
                  </view>
                  <text class="text-[10px] text-gray-500">{{ post.time }}</text>
                </view>
              </view>
              <view class="px-4 py-1.5 rounded-full bg-primary/20 text-primary text-xs font-bold">关注</view>
            </view>
            <text class="text-sm leading-relaxed font-medium">{{ post.content }}</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import NavBar from '@/components/NavBar.vue'

const mockNews = ref([
  {
    title: '虚幻引擎5新作《龙之觉醒》首支预告片公布，画质突破极限',
    tag: '业界动态',
    likes: '1.5',
    comments: '128',
    date: '05-24',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAWhanPKpkLUP4Zw0wmoDE_8YpmX6hBAjmAcUN1olfzxsFQNDNihangKzJ267T5eWG3G33ishgp9a5tzNN9pJAS5PnHb9t5ETxrAO5Aj1MrfXkgeDZBvUM0qif0GLyv4ncU5N3hnw6XZaXObDruwvxHyRQOleC4T2lS0-0Bz7lUKyaQPKOy-YYTjfL1hig5AoF_bVZhrkC7zeb1YCcO0I-YwvjdOfVaWkEVQ2LZ0UCBF2qprZKKsGrjc-31RsxllBUQ7qtjzQe_cAw'
  },
  {
    title: '独立游戏节获奖名单出炉：这款国产像素风作品包揽三项大奖',
    tag: '赛事新闻',
    likes: '0.86',
    comments: '56',
    date: '05-23',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBfNfOcS09hsRnwmM_KiEXKhAf6EnpBGFnEmddqdiLnZNUAY2LxMQskhg8Vf5axGrgu9EdGq9cYI-CWayPOLkb-ddU4FlciZlhRceLggj-rH0dm5fnDnCnp5nH9jXMdZ2xVaKao2UmwVUP4NYztDjJN3a2AsPvFyW4X0slhvUHLcPoQ6yCtyrzubFENepYPVEjm-cHfD1Z64V8b-KLR8Dk9cCWGBU_k3M5hHbQbLCGIO_MZtGkeoo4gm-a0KuPaJ2NcOUxSfVty_bc'
  }
])

const mockPosts = ref([
  {
    author: '星空旅人_Aria',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCPXztMYF9Z6yqq4_s52sJcMtbDWWhm23ZU1e6Oeb3U1O14w7ZStlm3TYaAZDF6QM3gKe5B2YDV5PHJNsJB9ISfAi-H6_JILB7RD6hAAItI7EafTcJRPRWE9KRRHfhk63yWyH1L2-8h3YlP-U0HUViXP38ic-KN_ZdBacNa-DgFgJGOTlDLDEqOckvI92NyjWBamJgUGMvKvT6UmHcX6_AqS5tV49aqcK_Cmom2apDPSM0rf0BOy4vrFbOoXZyROfuLyNJoBu6pZ14',
    level: 'LV.24',
    time: '2小时前',
    content: '终于在最高难度下通关了《永恒之境》！这游戏的打击感真的绝了，尤其是最后一段BOSS战的BGM，配合光影渲染简直是视觉盛宴。'
  },
  {
    author: 'Luna的小屋',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD86vB_lqXjCG9yF3L3OReif6f3DVDunAXNZfAQIOiaQUvaMrPUh6hGo-fRPUEkMMybp3P6I2lOhpZb5ahdDbxFt_4LJ8YgbjX1LekcrrhpbjJTLIikeVMQEQp5prVTopjO8U3C_TPBvKLabYprMNJG0p_Hr6SW8xrNF5f0q5O3mL4ITfa0_4welABx9LUYghbAqeW4Gg3TU3Y6LTg_NuIb9Vnv0fgmacjm7-ZaVtkXB0exEqxiu5uLLWzvYFw67MEf-cAcYhNTQlU',
    level: 'LV.16',
    time: '5小时前',
    content: '今天的装机分享：白色主题海景房！这次选了全套白色配件，配合柔和的蓝紫调灯光，整个人的心情都变好了。'
  }
])
</script>

<style scoped>
.space-y-3 > view {
  margin-bottom: 12px;
}

.space-y-6 > view {
  margin-bottom: 24px;
}
</style>
```

- [ ] **Step 2: Create pages/home directory**

```bash
mkdir -p bigPlayer/client/pages/home
```

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/client/pages/home/home.vue
git commit -m "feat(client/pages): add home page

- Migrate from client/home/home.html
- Banner, hot news list, recommendation feed
- Mock data integration

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Client 端徽章墙 — pages/profile/personalization/Badge.vue （部分1：s1-s3）

**Files:**
- Create: `bigPlayer/client/pages/profile/personalization/Badge.vue`
- Create: `bigPlayer/client/pages/profile/personalization/badgeData.js`

- [ ] **Step 1: Create badgeData.js with screen data**

```javascript
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
```

- [ ] **Step 2: Create Badge.vue（s1-s3 screens）**

```vue
<template>
  <view class="flex flex-col h-screen overflow-hidden bg-[#f0f6fb]">
    <!-- Screen 1: 徽章墙主页 -->
    <view v-if="currentScreen === 's1'" class="flex flex-col h-full overflow-hidden">
      <NavBar title="徽章墙" :showBack="false" />
      
      <scroll-view scroll-y class="flex-1 min-h-0">
        <!-- User Header -->
        <view class="bg-gradient-to-b from-primary to-primary/80 pb-3 px-4">
          <view class="flex items-center pt-2.5 gap-2.5">
            <view class="w-11 h-11 rounded-full border-2 border-white/80 bg-yellow-200 flex items-center justify-center text-[22px] flex-shrink-0">
              {{ currentUser.avatar }}
            </view>
            <view class="text-white text-[15px] font-semibold">{{ currentUser.nickname }}</view>
            <view class="ml-auto text-white/95 text-xs flex items-center gap-0.5 cursor-pointer" @click="goToMyBadges">
              共获得 {{ currentUser.earnedCount }} 个徽章
              <text>›</text>
            </view>
          </view>

          <!-- Display Slots -->
          <view class="mx-3 mt-2.5 bg-white rounded-xl px-3.5 py-3">
            <view class="text-[13px] text-[#333] font-medium flex items-center gap-1.5 mb-3">
              设置我的徽章展示
              <text class="text-primary cursor-pointer text-[13px] ml-auto" @click="goToSetDisplay">
                ✎
              </text>
            </view>
            <view class="flex gap-4">
              <view v-for="(slot, idx) in displaySlots" :key="idx" class="flex flex-col items-center gap-1.5 cursor-pointer" @click="goToSetDisplay">
                <view class="w-[62px] h-[62px] bg-[#d6eef8] [clip-path:polygon(50%_0%,93.3%_25%,93.3%_75%,50%_100%,6.7%_75%,6.7%_25%)] flex items-center justify-center text-[#5abfe8] text-[26px] font-light">
                  ＋
                </view>
                <text class="text-[11px] text-[#999]">添加徽章</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Category Tabs -->
        <view class="bg-white flex items-center px-3 py-[7px] gap-1.5 border-b border-[#f0f0f0]">
          <text class="text-[13px] text-white bg-primary font-medium px-3 py-1 rounded-[14px] cursor-pointer" @click="activeSection = 'active'">
            活跃成就
          </text>
          <text class="text-[13px] text-[#666] px-3 py-1 rounded-[14px] cursor-pointer" @click="activeSection = 'social'">
            社交影响
          </text>
          <text class="text-[13px] text-[#666] px-3 py-1 rounded-[14px] cursor-pointer" @click="activeSection = 'spread'">
            互动传播
          </text>
        </view>

        <!-- Badge Grid -->
        <view class="flex-1 overflow-y-auto bg-white px-3.5 pb-4 min-h-0">
          <view class="flex items-center gap-2 pt-3.5 pb-2.5 text-sm font-semibold text-[#222]">
            <view class="w-[3px] h-[15px] bg-primary rounded-sm flex-shrink-0"></view>
            <text>{{ activeSection === 'active' ? '活跃成就' : activeSection === 'social' ? '社交影响' : '互动传播' }}</text>
            <text class="text-primary font-bold">{{ activeBadges.length }}/10</text>
          </view>
          <view class="grid grid-cols-3 gap-y-1 pb-2">
            <view v-for="badge in activeBadges" :key="badge.name" class="flex flex-col items-center gap-1.5 p-2.5 cursor-pointer" @click="viewBadgeDetail(badge)">
              <BadgeIcon 
                :shape="badge.shape"
                :level="badge.level"
                :name="badge.name"
                :emoji="badge.emoji"
                :show-gift-badge="badge.giftBadge"
                :upgradable="badge.upgradable"
              />
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- Screen 2: 我的徽章 -->
    <view v-if="currentScreen === 's2'" class="flex flex-col h-full overflow-hidden">
      <view class="bg-gradient-to-b from-primary to-primary/80 pt-11 px-4 pb-3.5 flex items-center flex-shrink-0">
        <text class="text-white text-[22px] cursor-pointer w-7" @click="goBackToS1">‹</text>
        <view class="flex-1 text-center text-white text-[17px] font-semibold mr-7">我的徽章</view>
      </view>
      <view class="px-4 pt-4 pb-3 text-[15px] text-[#333]">
        共获得 <text class="text-primary font-bold">1</text> 枚徽章
      </view>
      <scroll-view scroll-y class="flex-1 px-3.5">
        <view class="grid grid-cols-3 gap-y-1 pb-2">
          <view v-for="badge in userBadges" :key="badge.name" class="flex flex-col items-center gap-1.5 p-2.5 cursor-pointer" @click="viewBadgeDetail(badge)">
            <BadgeIcon 
              :shape="badge.shape"
              :level="badge.level"
              :name="badge.name"
              :emoji="badge.emoji"
              :show-gift-badge="badge.giftBadge"
              :upgradable="badge.upgradable"
            />
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- Screen 3: 设置徽章展示 -->
    <view v-if="currentScreen === 's3'" class="flex flex-col h-full overflow-hidden">
      <view class="bg-gradient-to-b from-primary to-primary/80 pt-11 px-4 pb-3.5 flex items-center flex-shrink-0">
        <text class="text-white text-[22px] cursor-pointer w-7" @click="goBackToS1">‹</text>
        <view class="flex-1 text-center text-white text-[17px] font-semibold mr-7">设置徽章展示</view>
      </view>
      <scroll-view scroll-y class="flex-1 px-3.5 py-4 min-h-0">
        <view class="text-[15px] text-[#333] font-medium mb-3.5">
          展示的徽章 <text class="text-primary font-bold">0</text>/3
        </view>
        <view class="flex gap-5 mb-1.5">
          <view class="w-[72px] h-[72px] bg-[#cde9f7] [clip-path:polygon(50%_0%,93.3%_25%,93.3%_75%,50%_100%,6.7%_75%,6.7%_25%)] flex items-center justify-center text-[#5abfe8] text-[28px] font-light">
            ＋
          </view>
          <view class="w-[72px] h-[72px] bg-[#cde9f7] [clip-path:polygon(50%_0%,93.3%_25%,93.3%_75%,50%_100%,6.7%_75%,6.7%_25%)] flex items-center justify-center text-[#5abfe8] text-[28px] font-light">
            ＋
          </view>
          <view class="w-[72px] h-[72px] bg-[#cde9f7] [clip-path:polygon(50%_0%,93.3%_25%,93.3%_75%,50%_100%,6.7%_75%,6.7%_25%)] flex items-center justify-center text-[#5abfe8] text-[28px] font-light">
            ＋
          </view>
        </view>
        <view class="h-px bg-[#e8ecf0] my-3.5"></view>
        <text class="text-[13px] text-[#888] mb-3">点击下方徽章选择</text>
        <view class="grid grid-cols-3 gap-y-1">
          <view v-for="badge in userBadges" :key="badge.name" class="flex flex-col items-center gap-1.5 p-2.5 cursor-pointer">
            <BadgeIcon 
              :shape="badge.shape"
              :level="badge.level"
              :name="badge.name"
              :emoji="badge.emoji"
              :show-gift-badge="badge.giftBadge"
              :upgradable="badge.upgradable"
            />
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import NavBar from '@/components/NavBar.vue'
import BadgeIcon from '@/components/BadgeIcon.vue'
import { getBadgeScreenData } from './badgeData'

const data = getBadgeScreenData()
const currentScreen = ref('s1')
const activeSection = ref('active')
const currentUser = ref(data.currentUser)
const badges = ref(data.badges)
const displaySlots = ref(data.displaySlots)

const userBadges = computed(() => badges.value.active.filter(b => b.earned))

const activeBadges = computed(() => {
  if (activeSection.value === 'active') return badges.value.active
  if (activeSection.value === 'social') return badges.value.social
  return badges.value.spread
})

const goToMyBadges = () => {
  currentScreen.value = 's2'
  window.parent?.postMessage({ type: 'screenChange', screen: 's2' }, '*')
}

const goToSetDisplay = () => {
  currentScreen.value = 's3'
  window.parent?.postMessage({ type: 'screenChange', screen: 's3' }, '*')
}

const goBackToS1 = () => {
  currentScreen.value = 's1'
  window.parent?.postMessage({ type: 'screenChange', screen: 's1' }, '*')
}

const viewBadgeDetail = (badge) => {
  currentScreen.value = 's4'
  window.parent?.postMessage({ type: 'screenChange', screen: 's4' }, '*')
}
</script>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
</style>
```

- [ ] **Step 3: Create profile directory structure**

```bash
mkdir -p bigPlayer/client/pages/profile/personalization
```

- [ ] **Step 4: Commit**

```bash
git add bigPlayer/client/pages/profile/personalization/
git commit -m "feat(client/pages): add Badge page s1-s3 screens

- Badge wall main page (s1)
- My badges page (s2)
- Set badge display page (s3)
- Screen switching with postMessage

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

---

### Task 8: Client 端 Badge.vue — s4 徽章详情页

**Files:**
- Modify: `bigPlayer/client/pages/profile/personalization/Badge.vue`

- [ ] **Step 1: Append s4 screen to Badge.vue template** (inside the root `<view>`)

```vue
    <!-- Screen 4: 徽章详情 -->
    <view v-if="currentScreen === 's4'" class="flex flex-col h-full overflow-hidden relative"
          style="background: radial-gradient(ellipse 120% 60% at 50% 30%, #1a4060 0%, #0d2535 40%, #060e18 100%)">
      <!-- 光晕装饰 -->
      <view class="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[300px] pointer-events-none"
            style="background: linear-gradient(180deg, rgba(80,180,255,0.15) 0%, transparent 100%);
                   clip-path: polygon(40% 0%, 60% 0%, 100% 100%, 0% 100%);" />
      
      <view class="pt-11 px-4 flex items-center relative z-10">
        <text class="text-white/90 text-[22px] cursor-pointer" @click="goBackFromDetail">‹</text>
      </view>

      <view class="flex-1 flex flex-col items-center justify-center px-6 pb-12 relative z-10 overflow-y-auto min-h-0">
        <!-- 三枚徽章排列 -->
        <view class="flex items-center justify-center gap-3 mb-7">
          <view class="opacity-30">
            <view class="w-[60px] h-[60px] flex items-center justify-center text-white bg-[linear-gradient(145deg,#d4d4d4_0%,#b0b0b0_100%)]"
                  style="clip-path: polygon(50% 0%, 97% 34%, 79% 97%, 21% 97%, 3% 34%)">
              <text class="text-2xl">⭐</text>
            </view>
          </view>
          <view class="w-24 h-24 flex items-center justify-center text-white"
                :class="detailBadge?.level === 'normal' ? 'bg-[linear-gradient(145deg,#c89850_0%,#7a5020_60%,#4a3010_100%)]' : ''"
                style="clip-path: polygon(50% 0%, 97% 34%, 79% 97%, 21% 97%, 3% 34%)">
            <text class="text-4xl">{{ detailBadge?.emoji }}</text>
          </view>
          <view class="opacity-30">
            <view class="w-[60px] h-[60px] flex items-center justify-center text-white bg-[linear-gradient(145deg,#d4d4d4_0%,#b0b0b0_100%)]"
                  style="clip-path: polygon(50% 0%, 97% 34%, 79% 97%, 21% 97%, 3% 34%)">
              <text class="text-2xl">💬</text>
            </view>
          </view>
        </view>

        <text class="text-[13px] text-white/60 mb-2.5">2026-04-03 17:58:09 获得</text>
        <view class="flex items-center gap-2 mb-2">
          <text class="text-xl font-bold text-white">{{ detailBadge?.name }}</text>
          <view class="bg-[#2ec87a] text-white text-[11px] px-[7px] py-0.5 rounded-[9px]">普通</view>
        </view>
        <text class="text-sm text-white/75 mb-9 text-center leading-relaxed">在社区内【连续登录】3天</text>

        <!-- 奖励展示区 -->
        <RewardPanel v-if="s4RewardVisible" :rewards="mockRewardItems" :dark-mode="true" @claim="handleS4Claim" />

        <button class="bg-[#3ab4e8] text-white border-none rounded-[25px] py-3.5 text-base font-medium w-[260px] cursor-pointer">佩戴徽章</button>
      </view>
    </view>
```

- [ ] **Step 2: Add s4 state and methods to `<script setup>`**

```javascript
// 在 Badge.vue script setup 末尾追加：
import RewardPanel from '@/components/RewardPanel.vue'

const detailBadge = ref(null)
const s4RewardVisible = ref(true)
const fromScreen = ref('s1')

const mockRewardItems = [
  { name: '灵石', icon: '💎', qty: 10 },
  { name: '金锭', icon: '🏅', qty: 5 },
  { name: '元宝', icon: '💰', qty: 3 },
  { name: '丹玉', icon: '🟢', qty: 2 },
  { name: '深海龙头像', icon: '🖼️', qty: 1 }
]

const viewBadgeDetail = (badge) => {
  detailBadge.value = badge
  fromScreen.value = currentScreen.value
  s4RewardVisible.value = true
  currentScreen.value = 's4'
  window.parent?.postMessage({ type: 'screenChange', screen: 's4' }, '*')
}

const goBackFromDetail = () => {
  currentScreen.value = fromScreen.value
  window.parent?.postMessage({ type: 'screenChange', screen: fromScreen.value }, '*')
}

const handleS4Claim = () => {
  s4RewardVisible.value = false
}
```

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/client/pages/profile/personalization/Badge.vue
git commit -m "feat(client/pages): add Badge page s4 detail screen

- Badge detail page with dark gradient background
- Halo decoration with clip-path
- Three-badge display with RewardPanel integration

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Client 端 Badge.vue — s6 角色信息确认（s5 已从原型移除）

**Files:**
- Modify: `bigPlayer/client/pages/profile/personalization/Badge.vue`

- [ ] **Step 1: Append s5 screen**

```vue
    <!-- Screen 5: 徽章获得通知弹窗 -->
    <view v-if="currentScreen === 's5'" class="flex flex-col h-full overflow-hidden relative bg-[#f0f6fb]">
      <!-- 顶部导航（模拟背景页） -->
      <view class="bg-gradient-to-b from-primary to-primary/80 pt-11 px-4 pb-3.5 flex items-center flex-shrink-0">
        <text class="text-white text-[22px] cursor-pointer w-7" @click="currentScreen = 's1'">‹</text>
        <view class="flex-1 text-center text-white text-[17px] font-semibold mr-7">获得徽章通知弹窗</view>
      </view>
      <!-- 遮罩层弹窗 -->
      <view class="absolute top-0 left-0 right-0 bottom-0 bg-black/50 flex items-center justify-center z-10">
        <view class="bg-white rounded-2xl w-[300px] px-5 py-7 flex flex-col items-center relative shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
          <text class="absolute top-2.5 right-3 w-6 h-6 rounded-full bg-[#f0f0f0] text-[#888] flex items-center justify-center text-sm cursor-pointer font-semibold"
                @click="currentScreen = 's1'">×</text>
          <text class="text-lg font-bold text-[#ff6b35] mb-3.5">恭喜获得</text>
          <!-- 徽章圆形大图 -->
          <view class="mb-3.5 w-[100px] h-[100px] rounded-full bg-[linear-gradient(145deg,#f5c842_0%,#e09800_100%)] flex items-center justify-center shadow-[0_4px_20px_rgba(224,152,0,0.5)]">
            <text class="text-5xl">🏅</text>
          </view>
          <view class="flex items-center gap-[7px] mb-1.5">
            <text class="text-base font-bold text-[#1a2233]">签到达人</text>
            <text class="text-[11px] px-[7px] py-0.5 rounded-[9px] font-medium bg-[#fff3e0] text-[#ff9500]">珍贵</text>
          </view>
          <text class="text-xs text-[#aaa] mb-3 text-center">在平台签到1次 | 2024/04/11获得</text>
          <!-- 奖励区（亮色版） -->
          <RewardPanel v-if="s5RewardVisible" :rewards="mockRewardItems" :dark-mode="false" @claim="handleS5Claim" />
          <button class="w-full border border-[#ddd] bg-white rounded-[22px] py-[11px] text-sm text-[#555] cursor-pointer"
                  @click="goToRoleConfirm">查看详情</button>
        </view>
      </view>
    </view>

    <!-- Screen 6: 角色信息确认 -->
    <view v-if="currentScreen === 's6'" class="flex flex-col h-full overflow-hidden bg-[#f5f8fc]">
      <view class="bg-gradient-to-b from-primary to-primary/80 pt-11 px-4 pb-3.5 flex items-center flex-shrink-0">
        <text class="text-white text-[22px] cursor-pointer w-7" @click="currentScreen = 's5'">‹</text>
        <view class="flex-1 text-center text-white text-[17px] font-semibold mr-7">角色信息确认</view>
      </view>
      <view class="flex-1 px-4 py-5">
        <view class="bg-white rounded-xl px-4 py-5">
          <view class="mb-3.5">
            <text class="text-[13px] text-[#333] font-medium mb-2">接收角色 <text class="text-[#ff4d4f]">*</text></text>
            <view class="flex items-center justify-between border border-[#e0e6ed] rounded-lg px-3 py-2.5 text-[13px] text-[#333] cursor-pointer bg-[#fafbfc] mt-2">
              <text>武帝无敌</text>
              <text class="text-[#999] text-sm">▼</text>
            </view>
          </view>
          <text class="text-xs text-[#aaa] text-center my-3.5 block">请仔细确认角色信息，确定后自动到账</text>
          <button class="w-full bg-[#3ab4e8] text-white border-none rounded-lg py-3.5 text-[15px] font-semibold cursor-pointer tracking-[4px]">确 定</button>
        </view>
      </view>
    </view>
```

- [ ] **Step 2: Add s5/s6 state and methods**

```javascript
const s5RewardVisible = ref(true)

const handleS5Claim = () => {
  currentScreen.value = 's6'
  window.parent?.postMessage({ type: 'screenChange', screen: 's6' }, '*')
}

const goToRoleConfirm = () => {
  fromScreen.value = 's5'
  detailBadge.value = { name: '签到达人', emoji: '🏅', level: 'rare' }
  currentScreen.value = 's4'
  window.parent?.postMessage({ type: 'screenChange', screen: 's4' }, '*')
}
```

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/client/pages/profile/personalization/Badge.vue
git commit -m "feat(client/pages): add Badge page s5-s6 screens

- Badge earned notification popup (s5) with light theme RewardPanel
- Role info confirmation page (s6)
- Screen navigation: s5 → s6 (claim) and s5 → s4 (view detail)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Client 端 badgeData.js — 补充 s4-s6 数据 + Toast 工具

**Files:**
- Modify: `bigPlayer/client/pages/profile/personalization/badgeData.js`

- [ ] **Step 1: Append to badgeData.js**

```javascript
export const mockDetailBadge = {
  name: '准时上线',
  emoji: '🚀',
  level: 'normal',
  earnDate: '2026-04-03 17:58:09',
  condition: '在社区内【连续登录】3天',
  shape: 'pentagon'
}

export const mockNotifyBadge = {
  name: '签到达人',
  emoji: '🏅',
  level: 'rare',
  earnDate: '2024/04/11',
  condition: '在平台签到1次'
}

export const mockRoleOptions = [
  { id: 'r1', name: '武帝无敌' },
  { id: 'r2', name: '龙之行者' }
]
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/client/pages/profile/personalization/badgeData.js
git commit -m "feat(client/pages): add s4-s6 badge mock data

- Badge detail and notification mock data
- Role options for reward confirmation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Part B：Admin 端 — React 项目初始化

### Task 11: Admin React 项目骨架

**Files:**
- Create: `bigPlayer/admin/package.json`
- Create: `bigPlayer/admin/vite.config.js`
- Create: `bigPlayer/admin/index.html`
- Create: `bigPlayer/admin/.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "bigplayer-admin",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create vite.config.js**

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: 'localhost'
  }
})
```

- [ ] **Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>大玩家后台</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
.DS_Store
.env.local
```

- [ ] **Step 5: Run npm install**

```bash
cd bigPlayer/admin
npm install
```

Expected: No errors, node_modules created

- [ ] **Step 6: Commit**

```bash
git add bigPlayer/admin/package.json bigPlayer/admin/vite.config.js bigPlayer/admin/index.html bigPlayer/admin/.gitignore
git commit -m "feat(admin): init React project scaffold

- Vite + React 18 + react-router-dom v6
- Dev server on port 5174

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 12: Admin React 入口文件

**Files:**
- Create: `bigPlayer/admin/src/main.jsx`
- Create: `bigPlayer/admin/src/App.jsx`
- Create: `bigPlayer/admin/src/App.css`

- [ ] **Step 1: Create src/main.jsx**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
```

- [ ] **Step 2: Create src/App.jsx**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import BadgeManage from './pages/community/BadgeManage.jsx'

export default function App() {
  return (
    <div className="admin-layout">
      <Routes>
        <Route path="/" element={<Navigate to="/community/badge" replace />} />
        <Route path="/community/badge" element={<BadgeManage />} />
      </Routes>
    </div>
  )
}
```

- [ ] **Step 3: Create src/App.css**

```css
/* Global reset */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
  background: #f5f7fa;
  min-height: 100vh;
  color: #262626;
}

.admin-layout {
  min-height: 100vh;
  padding: 24px;
}

/* ── 页面卡片 ── */
.page-card {
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  margin-bottom: 16px;
  overflow: hidden;
}

/* ── Tab 栏 ── */
.tab-bar { display: flex; border-bottom: 1px solid #e8e8e8; padding: 0 20px; }
.tab-item { padding: 14px 16px; font-size: 14px; color: #595959; cursor: pointer; position: relative; user-select: none; }
.tab-item.active { color: #1890ff; font-weight: 500; }
.tab-item.active::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: #1890ff; border-radius: 1px 1px 0 0; }

/* ── 筛选栏 ── */
.filter-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 16px 20px; border-bottom: 1px solid #f0f0f0; }
.filter-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #595959; }
.filter-required { color: #ff4d4f; }
.filter-select, .filter-input { height: 32px; border: 1px solid #d9d9d9; border-radius: 4px; padding: 0 10px; font-size: 13px; color: #262626; background: #fff; outline: none; cursor: pointer; min-width: 140px; }
.filter-input { min-width: 160px; cursor: text; }
.filter-select:focus, .filter-input:focus { border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.2); }
.btn-query { height: 32px; padding: 0 16px; background: #1890ff; color: #fff; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; transition: background 0.2s; }
.btn-query:hover { background: #40a9ff; }

/* ── 操作栏 ── */
.action-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid #f0f0f0; }
.btn-add { height: 32px; padding: 0 16px; background: #1890ff; color: #fff; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; transition: background 0.2s; }
.btn-add:hover { background: #40a9ff; }
.toolbar-icons { display: flex; gap: 8px; }
.toolbar-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 14px; cursor: pointer; color: #595959; background: #fff; }
.toolbar-icon:hover { border-color: #1890ff; color: #1890ff; }

/* ── 表格 ── */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead tr { background: #fafafa; }
th { padding: 12px; text-align: left; font-weight: 500; color: #262626; border-bottom: 1px solid #e8e8e8; white-space: nowrap; }
td { padding: 14px 12px; color: #595959; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
tbody tr:hover { background: #fafeff; }
.level-tag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 500; border: 1px solid transparent; white-space: nowrap; }
.level-rare     { color: #fa8c16; background: #fff7e6; border-color: #ffd591; }
.level-uncommon { color: #722ed1; background: #f9f0ff; border-color: #d3adf7; }
.level-epic     { color: #f5222d; background: #fff1f0; border-color: #ffa39e; }
.level-legend   { color: #1890ff; background: #e6f7ff; border-color: #91d5ff; }
.level-normal   { color: #8c6e3f; background: #fdf6ec; border-color: #d4b483; }
.status-pass    { color: #52c41a; font-weight: 500; }
.status-reject  { color: #ff4d4f; font-weight: 500; }
.op-btn         { background: none; border: none; font-size: 13px; cursor: pointer; padding: 2px 4px; }
.op-edit        { color: #1890ff; }
.op-edit:hover  { color: #40a9ff; }
.op-delete      { color: #ff4d4f; }
.op-delete:hover { color: #ff7875; }
.badge-icon-preview { width: 40px; height: 40px; clip-path: polygon(50% 0%, 97% 34%, 79% 97%, 21% 97%, 3% 34%); display: flex; align-items: center; justify-content: center; font-size: 18px; }
.desc-cell { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── 分页 ── */
.pagination { display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 14px 20px; font-size: 13px; color: #595959; }
.page-total { margin-right: 8px; }
.page-btn { min-width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 1px solid #d9d9d9; border-radius: 4px; cursor: pointer; font-size: 13px; background: #fff; padding: 0 6px; transition: all 0.2s; user-select: none; }
.page-btn:hover { border-color: #1890ff; color: #1890ff; }
.page-btn.active { background: #1890ff; border-color: #1890ff; color: #fff; }
.page-btn.disabled { color: #d9d9d9; cursor: not-allowed; border-color: #d9d9d9; }
.page-size-select { height: 28px; border: 1px solid #d9d9d9; border-radius: 4px; padding: 0 6px; font-size: 13px; outline: none; cursor: pointer; }
.page-jump { display: flex; align-items: center; gap: 6px; margin-left: 8px; }
.page-jump input { width: 44px; height: 28px; border: 1px solid #d9d9d9; border-radius: 4px; text-align: center; font-size: 13px; outline: none; }

/* ── 弹窗 ── */
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; align-items: center; justify-content: center; }
.modal-overlay.open { display: flex; }
.modal-box { background: #fff; border-radius: 8px; width: 572px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.2); position: relative; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e8e8e8; flex-shrink: 0; }
.modal-title { font-size: 16px; font-weight: 600; color: #262626; }
.modal-close { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #f0f0f0; color: #888; font-size: 14px; cursor: pointer; font-weight: 600; border: none; transition: background 0.15s; }
.modal-close:hover { background: #e0e0e0; }
.modal-lang-bar { padding: 12px 20px 0; display: flex; gap: 8px; flex-shrink: 0; }
.modal-lang-tab { padding: 5px 14px; border: 1px solid #1890ff; border-radius: 4px; font-size: 13px; color: #1890ff; cursor: pointer; background: #e6f7ff; }
.modal-body { flex: 1; overflow-y: auto; padding: 20px; }
.modal-footer { padding: 12px 20px; border-top: 1px solid #e8e8e8; display: flex; justify-content: flex-end; flex-shrink: 0; }

/* ── 表单 ── */
.form-row { display: flex; align-items: flex-start; margin-bottom: 16px; gap: 8px; }
.form-label { width: 88px; flex-shrink: 0; font-size: 13px; color: #595959; padding-top: 7px; text-align: right; }
.form-required { color: #ff4d4f; }
.form-control { flex: 1; }
.form-input, .form-select { width: 100%; height: 34px; border: 1px solid #d9d9d9; border-radius: 4px; padding: 0 10px; font-size: 13px; color: #262626; outline: none; background: #fff; }
.form-input:focus, .form-select:focus { border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.15); }
.module-pill { display: inline-block; padding: 4px 12px; background: #e6f7ff; color: #1890ff; border-radius: 4px; font-size: 13px; font-weight: 500; }
.upload-box { width: 100px; height: 100px; border: 1.5px dashed #d9d9d9; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; color: #bfbfbf; font-size: 24px; gap: 4px; transition: border-color 0.2s; }
.upload-box:hover { border-color: #1890ff; color: #1890ff; }
.upload-hint { font-size: 11px; color: #bfbfbf; margin-top: 6px; line-height: 1.6; }
.condition-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.condition-row .form-select { flex: 0 0 130px; width: 130px; }
.condition-row .form-input { flex: 1; }
.condition-unit { font-size: 13px; color: #595959; white-space: nowrap; }
.btn-submit { height: 36px; padding: 0 24px; background: #1890ff; color: #fff; border: none; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
.btn-submit:hover { background: #40a9ff; }

/* ── 开关 ── */
.toggle-wrap { display: flex; align-items: center; gap: 8px; }
.toggle-track { position: relative; width: 36px; height: 20px; display: inline-block; cursor: pointer; flex-shrink: 0; }
.toggle-track input { opacity: 0; width: 0; height: 0; position: absolute; }
.toggle-bg { position: absolute; inset: 0; background: #d9d9d9; border-radius: 20px; transition: background 0.2s; }
.toggle-bg::before { content: ''; position: absolute; width: 14px; height: 14px; border-radius: 50%; background: #fff; top: 3px; left: 3px; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.toggle-track input:checked + .toggle-bg { background: #1890ff; }
.toggle-track input:checked + .toggle-bg::before { transform: translateX(16px); }
.toggle-label { font-size: 13px; color: #595959; }

/* ── 奖品 ── */
.prize-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.prize-select { flex: 0 0 110px; width: 110px; }
.prize-item-input { flex: 1; min-width: 100px; }
.prize-qty-input { flex: 0 0 80px; width: 80px; }
.btn-prize-add { height: 34px; padding: 0 12px; background: #1890ff; color: #fff; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; white-space: nowrap; transition: background 0.2s; }
.btn-prize-add:hover { background: #40a9ff; }
.btn-prize-add:disabled { background: #bfbfbf; cursor: not-allowed; }
.btn-prize-clear { height: 34px; padding: 0 12px; background: #fff; color: #595959; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 13px; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
.btn-prize-clear:hover { border-color: #ff4d4f; color: #ff4d4f; }
.prize-added-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.prize-tag { display: flex; align-items: center; gap: 5px; background: #fff0e6; border: 1px solid #ffbb96; border-radius: 20px; padding: 4px 10px; font-size: 12px; color: #d4380d; }
.prize-tag-remove { cursor: pointer; font-size: 13px; color: #d4380d; line-height: 1; margin-left: 2px; }
.prize-tag-remove:hover { color: #ff4d4f; }
```

- [ ] **Step 4: Commit**

```bash
git add bigPlayer/admin/src/
git commit -m "feat(admin): add React entry files and global CSS

- main.jsx with BrowserRouter
- App.jsx with react-router routes
- App.css with all admin styles (extracted from BadgeManage.html)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 13: Admin Mock 数据

**Files:**
- Create: `bigPlayer/admin/src/data/mockBadges.js`

- [ ] **Step 1: Create mockBadges.js**

```javascript
export const MOCK_BADGES = [
  { sort: 1, name: '花式点赞', level: 'rare',     levelText: '珍贵', icon: '👍', desc: '在社区内累计【点赞】100次',    category: '活跃成就', condition: '累计点赞，100次',   count: 7891,  status: '审核通过', reviewer: '梁仓', reviewTime: '2025-12-02 11:19:13', reviewNote: '通过' },
  { sort: 1, name: '花式点赞', level: 'uncommon', levelText: '稀有', icon: '👍', desc: '在社区内累计【点赞】500次',    category: '活跃成就', condition: '累计点赞，500次',   count: 1980,  status: '审核通过', reviewer: '梁仓', reviewTime: '2025-12-02 11:19:13', reviewNote: '通过' },
  { sort: 1, name: '花式点赞', level: 'epic',     levelText: '史诗', icon: '👍', desc: '在社区内累计【点赞】1000次',   category: '活跃成就', condition: '累计点赞，1000次',  count: 1190,  status: '审核通过', reviewer: '梁仓', reviewTime: '2025-12-02 11:19:13', reviewNote: '通过' },
  { sort: 1, name: '花式点赞', level: 'legend',   levelText: '传奇', icon: '👍', desc: '在社区内累计【点赞】10000次',  category: '活跃成就', condition: '累计点赞，10000次', count: 50,    status: '审核通过', reviewer: '梁仓', reviewTime: '2025-12-02 11:19:13', reviewNote: '通过' },
  { sort: 1, name: '花式点赞', level: 'normal',   levelText: '普通', icon: '👍', desc: '在社区内累计【点赞】10次',     category: '活跃成就', condition: '累计点赞，10次',    count: 33022, status: '审核通过', reviewer: '梁仓', reviewTime: '2025-12-02 11:19:13', reviewNote: '通过' },
]

export const ICON_BG = {
  rare:     'linear-gradient(145deg,#f5c842 0%,#c98a00 100%)',
  uncommon: 'linear-gradient(145deg,#b27fdb 0%,#6a1faa 100%)',
  epic:     'linear-gradient(145deg,#f07070 0%,#c01010 100%)',
  legend:   'linear-gradient(145deg,#70b8ff 0%,#0060d0 100%)',
  normal:   'linear-gradient(145deg,#c89850 0%,#7a5020 100%)',
}

export const MODULES = ['超能世界', '天墙传说手游', '逍遥情缘', '太初界', '钓鱼世界', '泰坦降临', '天墙传说', '择日飞仙']

export const COND_TYPES = ['连续登录', '累计点赞', '累计评论', '累计发帖', '累计收藏']

export const COND_UNITS = { '连续登录': '天', '累计点赞': '次', '累计评论': '次', '累计发帖': '次', '累计收藏': '次' }
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/admin/src/data/
git commit -m "feat(admin/data): add badge mock data

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Part C：Admin 端 — React 组件

### Task 14: Toggle 组件

**Files:**
- Create: `bigPlayer/admin/src/components/Toggle.jsx`

- [ ] **Step 1: Create Toggle.jsx**

```jsx
export default function Toggle({ checked, onChange, label }) {
  return (
    <div className="toggle-wrap">
      <label className="toggle-track">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="toggle-bg" />
      </label>
      {label && <span className="toggle-label">{checked ? '开启' : '关闭'}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/admin/src/components/Toggle.jsx
git commit -m "feat(admin/components): add Toggle component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 15: Pagination 组件

**Files:**
- Create: `bigPlayer/admin/src/components/Pagination.jsx`

- [ ] **Step 1: Create Pagination.jsx**

```jsx
import { useState } from 'react'

export default function Pagination({ total, pageSize = 10, current, onChange }) {
  const pageCount = Math.ceil(total / pageSize)
  const [jumpVal, setJumpVal] = useState('')

  const pages = Array.from({ length: Math.min(pageCount, 5) }, (_, i) => i + 1)

  const handleJump = () => {
    const p = parseInt(jumpVal)
    if (p >= 1 && p <= pageCount) onChange(p)
    setJumpVal('')
  }

  return (
    <div className="pagination">
      <span className="page-total">共{total}条</span>
      <div className={`page-btn${current <= 1 ? ' disabled' : ''}`} onClick={() => current > 1 && onChange(current - 1)}>‹</div>
      {pages.map(p => (
        <div key={p} className={`page-btn${p === current ? ' active' : ''}`} onClick={() => onChange(p)}>{p}</div>
      ))}
      <div className={`page-btn${current >= pageCount ? ' disabled' : ''}`} onClick={() => current < pageCount && onChange(current + 1)}>›</div>
      <select className="page-size-select">
        <option>10条/页</option>
        <option>20条/页</option>
        <option>50条/页</option>
      </select>
      <div className="page-jump">
        跳至
        <input type="number" value={jumpVal} onChange={e => setJumpVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJump()} min="1" max={pageCount} />
        页
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/admin/src/components/Pagination.jsx
git commit -m "feat(admin/components): add Pagination component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 16: FilterBar 组件

**Files:**
- Create: `bigPlayer/admin/src/components/FilterBar.jsx`

- [ ] **Step 1: Create FilterBar.jsx**

```jsx
import { useState } from 'react'
import { MODULES } from '../data/mockBadges.js'

export default function FilterBar({ onQuery }) {
  const [module, setModule] = useState('超能世界')
  const [status, setStatus] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')

  return (
    <div className="filter-bar">
      <div className="filter-item">
        <span><span className="filter-required">*</span> 所属版块：</span>
        <select className="filter-select" value={module} onChange={e => setModule(e.target.value)}>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="filter-item">
        <span>状态：</span>
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">全部</option>
          <option value="审核通过">审核通过</option>
          <option value="已拒绝">已拒绝</option>
        </select>
      </div>
      <div className="filter-item">
        <span>徽章名称：</span>
        <input className="filter-input" value={name} onChange={e => setName(e.target.value)} placeholder="名称" />
      </div>
      <div className="filter-item">
        <span>徽章分类：</span>
        <select className="filter-select" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">全部</option>
          <option value="活跃成就">活跃成就</option>
          <option value="社交影响">社交影响</option>
          <option value="互动传播">互动传播</option>
        </select>
      </div>
      <button className="btn-query" onClick={() => onQuery({ module, status, name, category })}>查询</button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/admin/src/components/FilterBar.jsx
git commit -m "feat(admin/components): add FilterBar component

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 17: BadgeModal 组件

**Files:**
- Create: `bigPlayer/admin/src/components/BadgeModal.jsx`

- [ ] **Step 1: Create BadgeModal.jsx**

```jsx
import { useState, useEffect } from 'react'
import Toggle from './Toggle.jsx'
import { COND_TYPES, COND_UNITS } from '../data/mockBadges.js'

export default function BadgeModal({ visible, onClose, editData }) {
  const [form, setForm] = useState({ name: '', desc: '', level: '', category: '', condType: '连续登录', condVal: '', sort: '', })
  const [prizeEnabled, setPrizeEnabled] = useState(false)
  const [prizeType, setPrizeType] = useState('道具')
  const [prizeItem, setPrizeItem] = useState('')
  const [prizeQty, setPrizeQty] = useState('')
  const [prizes, setPrizes] = useState([])

  useEffect(() => {
    if (editData) {
      setForm({ name: editData.name, desc: editData.desc, level: editData.level, category: editData.category, condType: '连续登录', condVal: '', sort: String(editData.sort) })
    } else {
      setForm({ name: '', desc: '', level: '', category: '', condType: '连续登录', condVal: '', sort: '' })
    }
    setPrizes([])
    setPrizeEnabled(false)
  }, [editData, visible])

  const handleAddPrize = () => {
    if (!prizeItem) return alert('请输入物品名称')
    if (prizeType === '道具' && !prizeQty) return alert('请输入数量')
    if (prizes.length >= 5) return alert('最多添加5个奖品')
    setPrizes(prev => [...prev, { type: prizeType, name: prizeItem, qty: prizeType === '头像框' ? '' : prizeQty }])
    setPrizeItem('')
    setPrizeQty('')
  }

  if (!visible) return null

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">{editData ? '编辑徽章' : '新增徽章'}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-lang-bar">
          <div className="modal-lang-tab">中文</div>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-label">所属版块：</div>
            <div className="form-control"><span className="module-pill">超能世界</span></div>
          </div>
          <div className="form-row">
            <div className="form-label"><span className="form-required">*</span> 徽章名称：</div>
            <div className="form-control">
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="请输入徽章名称" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-label"><span className="form-required">*</span> 描述：</div>
            <div className="form-control">
              <input className="form-input" value={form.desc} onChange={e => setForm(f => ({...f, desc: e.target.value}))} placeholder="请输入徽章描述" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-label"><span className="form-required">*</span> 级别：</div>
            <div className="form-control">
              <select className="form-select" value={form.level} onChange={e => setForm(f => ({...f, level: e.target.value}))}>
                <option value="">请选择</option>
                <option value="normal">普通</option>
                <option value="rare">珍贵</option>
                <option value="uncommon">稀有</option>
                <option value="epic">史诗</option>
                <option value="legend">传奇</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-label"><span className="form-required">*</span> 图标：</div>
            <div className="form-control">
              <div className="upload-box"><span>＋</span></div>
              <div className="upload-hint">尺寸建议64×64，png/jpg格式，内存2M以内</div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-label"><span className="form-required">*</span> 分类：</div>
            <div className="form-control">
              <select className="form-select" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                <option value="">请选择徽章分类</option>
                <option value="活跃成就">活跃成就</option>
                <option value="社交影响">社交影响</option>
                <option value="互动传播">互动传播</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-label"><span className="form-required">*</span> 获得条件：</div>
            <div className="form-control">
              <div className="condition-row">
                <select className="form-select" value={form.condType} onChange={e => setForm(f => ({...f, condType: e.target.value}))}>
                  {COND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className="form-input" type="number" value={form.condVal} onChange={e => setForm(f => ({...f, condVal: e.target.value}))} placeholder="数值" min="1" />
                <span className="condition-unit">{COND_UNITS[form.condType] || '次'}</span>
              </div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-label"><span className="form-required">*</span> 排序：</div>
            <div className="form-control">
              <input className="form-input" type="number" value={form.sort} onChange={e => setForm(f => ({...f, sort: e.target.value}))} min="1" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-label">奖品选择：</div>
            <div className="form-control">
              <Toggle checked={prizeEnabled} onChange={setPrizeEnabled} label />
              {prizeEnabled && (
                <div style={{ marginTop: 10 }}>
                  <div className="prize-row">
                    <select className="form-select prize-select" value={prizeType} onChange={e => setPrizeType(e.target.value)}>
                      <option value="道具">游戏道具</option>
                      <option value="头像框">头像框</option>
                    </select>
                    <input className="form-input prize-item-input" value={prizeItem} onChange={e => setPrizeItem(e.target.value)} placeholder="请输入物品名称（ID）" />
                    {prizeType !== '头像框' && (
                      <input className="form-input prize-qty-input" type="number" value={prizeQty} onChange={e => setPrizeQty(e.target.value)} placeholder="最大输入：999999" min="1" max="999999" />
                    )}
                    <button className="btn-prize-add" disabled={prizes.length >= 5} onClick={handleAddPrize}>添加</button>
                    <button className="btn-prize-clear" onClick={() => { setPrizes([]); setPrizeItem(''); setPrizeQty('') }}>清空</button>
                  </div>
                  <div className="prize-added-list">
                    {prizes.map((p, i) => (
                      <div key={i} className="prize-tag">
                        {p.type === '头像框' ? '🖼️' : '🎁'} {p.name}{p.qty ? `×${p.qty}` : ''}
                        <span className="prize-tag-remove" onClick={() => setPrizes(prev => prev.filter((_, j) => j !== i))}>×</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-submit" onClick={onClose}>提交</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/admin/src/components/BadgeModal.jsx
git commit -m "feat(admin/components): add BadgeModal component

- Controlled modal with visible/onClose/editData props
- Form state management with useState
- Prize selection with Toggle integration (max 5)
- Condition type/unit sync

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 18: BadgeManage 页面

**Files:**
- Create: `bigPlayer/admin/src/pages/community/BadgeManage.jsx`

- [ ] **Step 1: Create BadgeManage.jsx**

```jsx
import { useState } from 'react'
import FilterBar from '../../components/FilterBar.jsx'
import Pagination from '../../components/Pagination.jsx'
import BadgeModal from '../../components/BadgeModal.jsx'
import { MOCK_BADGES, ICON_BG } from '../../data/mockBadges.js'

export default function BadgeManage() {
  const [activeTab, setActiveTab] = useState('list')
  const [badges, setBadges] = useState(MOCK_BADGES)
  const [currentPage, setCurrentPage] = useState(1)
  const [modalVisible, setModalVisible] = useState(false)
  const [editData, setEditData] = useState(null)

  const openAdd = () => { setEditData(null); setModalVisible(true) }
  const openEdit = (badge) => { setEditData(badge); setModalVisible(true) }

  return (
    <div>
      <div className="page-card">
        <div className="tab-bar">
          <div className={`tab-item${activeTab === 'list' ? ' active' : ''}`} onClick={() => setActiveTab('list')}>徽章列表</div>
          <div className={`tab-item${activeTab === 'audit' ? ' active' : ''}`} onClick={() => setActiveTab('audit')}>审核列表</div>
        </div>

        <FilterBar onQuery={() => {}} />

        <div className="action-bar">
          <button className="btn-add" onClick={openAdd}>新增</button>
          <div className="toolbar-icons">
            <div className="toolbar-icon" title="列设置">⊟</div>
            <div className="toolbar-icon" title="刷新">↺</div>
            <div className="toolbar-icon" title="全屏">⛶</div>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>排序</th><th>徽章名称</th><th>级别</th><th>图标</th><th>描述</th>
                <th>分类</th><th>获得条件</th><th>徽章领取人数</th><th>状态</th>
                <th>审核人</th><th>审核时间</th><th>审核备注</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {badges.map((b, i) => (
                <tr key={i}>
                  <td>{b.sort}</td>
                  <td>{b.name}</td>
                  <td><span className={`level-tag level-${b.level}`}>{b.levelText}</span></td>
                  <td>
                    <div className="badge-icon-preview" style={{ background: ICON_BG[b.level] }}>{b.icon}</div>
                  </td>
                  <td className="desc-cell" title={b.desc}>{b.desc}</td>
                  <td>{b.category}</td>
                  <td>{b.condition}</td>
                  <td>{b.count.toLocaleString()}</td>
                  <td><span className={b.status === '审核通过' ? 'status-pass' : 'status-reject'}>{b.status}</span></td>
                  <td>{b.reviewer}</td>
                  <td>{b.reviewTime}</td>
                  <td>{b.reviewNote}</td>
                  <td>
                    <button className="op-btn op-edit" onClick={() => openEdit(b)}>编辑</button>
                    <button className="op-btn op-delete">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination total={50} pageSize={10} current={currentPage} onChange={setCurrentPage} />
      </div>

      <BadgeModal visible={modalVisible} onClose={() => setModalVisible(false)} editData={editData} />
    </div>
  )
}
```

- [ ] **Step 2: Create pages directory**

```bash
mkdir -p bigPlayer/admin/src/pages/community
```

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/admin/src/pages/
git commit -m "feat(admin/pages): add BadgeManage page

- Tab switching (list/audit)
- FilterBar, table with mock data, Pagination
- BadgeModal integration for add/edit

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Part D：原型展示外壳

### Task 19: Client 端原型外壳 HTML

**Files:**
- Create: `bigPlayer/client/prototype-shell/index.html`

- [ ] **Step 1: Create prototype-shell/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>大玩家 Client 原型展示</title>
  <link rel="stylesheet" href="../../shared/sidebar.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; min-height: 100vh; background: #f0f4f8; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; }
    .proto-shell { display: flex; flex: 1; }
    .phone-frame { flex-shrink: 0; width: 375px; height: 667px; margin: 24px; border-radius: 12px; overflow: hidden; box-shadow: 2px 0 16px rgba(0,0,0,0.10); position: sticky; top: 24px; self-start: true; }
    .phone-frame iframe { width: 100%; height: 100%; border: none; }
    .doc-panel { flex: 1; min-width: 300px; max-width: 480px; background: #fff; border-left: 1px solid #e8ecf0; padding: 24px; overflow-y: auto; height: 100vh; position: sticky; top: 0; }
    .doc-panel h2 { font-size: 15px; font-weight: 600; color: #1a2233; margin-bottom: 8px; }
    .doc-panel p { font-size: 13px; color: #555; line-height: 1.7; }
  </style>
</head>
<body>
<nav id="sidebar" class="sidebar"></nav>
<div class="proto-shell">
  <div class="phone-frame">
    <iframe id="app-frame" src="http://localhost:5173" title="Client App"></iframe>
  </div>
  <div class="doc-panel" id="doc-panel">
    <h2>Client 原型展示</h2>
    <p>UniApp H5 开发服务运行于 <code>localhost:5173</code></p>
    <p style="margin-top:12px">页面切换时，文档面板会同步显示对应屏的说明。</p>
  </div>
</div>
<script src="../../shared/sidebar-data.js"></script>
<script src="../../shared/sidebar.js"></script>
<script>
  initSidebar({ root: '../..', currentHref: 'bigPlayer/client/prototype-shell/index.html' });

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'screenChange') {
      const panel = document.getElementById('doc-panel')
      panel.dataset.screen = e.data.screen
    }
  })
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/client/prototype-shell/
git commit -m "feat(client/shell): add prototype shell HTML

- Three-column layout: sidebar + phone iframe + doc panel
- postMessage listener for screen sync
- Links to shared sidebar

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 20: Admin 端原型外壳 HTML

**Files:**
- Create: `bigPlayer/admin/prototype-shell/index.html`

- [ ] **Step 1: Create prototype-shell/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>大玩家 Admin 原型展示</title>
  <link rel="stylesheet" href="../../shared/sidebar.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; min-height: 100vh; background: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; }
    .admin-frame { flex: 1; min-height: 100vh; }
    .admin-frame iframe { width: 100%; height: 100vh; border: none; }
  </style>
</head>
<body>
<nav id="sidebar" class="sidebar"></nav>
<div class="admin-frame">
  <iframe id="app-frame" src="http://localhost:5174" title="Admin App"></iframe>
</div>
<script src="../../shared/sidebar-data.js"></script>
<script src="../../shared/sidebar.js"></script>
<script>
  initSidebar({ root: '../..', currentHref: 'bigPlayer/admin/prototype-shell/index.html' });
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add bigPlayer/admin/prototype-shell/
git commit -m "feat(admin/shell): add prototype shell HTML

- Sidebar + full-width admin iframe
- Links to React dev server at localhost:5174

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 21: 更新 constraint.md

**Files:**
- Modify: `bigPlayer/client/constraint.md`
- Modify: `bigPlayer/admin/constraint.md`

- [ ] **Step 1: Append to bigPlayer/client/constraint.md**

```markdown
## 框架规范（UniApp）

- **技术栈**：UniApp 3 + Vue 3 + Vite + Tailwind CSS（@uni-helper/vite-plugin-uni-tailwind）
- **组件命名**：PascalCase，`.vue` 单文件组件
- **页面路由**：通过 `pages.json` 配置，新页面必须在此注册
- **多屏页面**：组件内 `v-if` + `currentScreen` ref 切换，不跨页面路由
- **外壳通信**：每次切换 screen 必须调用 `window.parent?.postMessage({ type: 'screenChange', screen: id }, '*')`
- **样式优先级**：Tailwind class 优先，clip-path/伪元素等不支持项用 `<style scoped>` 补充
- **静态资源**：本地图片放 `static/`，外部 CDN 直接引用
- **原生标签**：UniApp 内禁止使用 `<div>`/`<span>`，必须使用 `<view>`/`<text>`
```

- [ ] **Step 2: Append to bigPlayer/admin/constraint.md**

```markdown
## 框架规范（React）

- **技术栈**：React 18 + Vite + react-router-dom v6，dev server 端口 5174
- **组件命名**：PascalCase，`.jsx` 文件
- **样式**：原生 CSS，className 引用 `App.css` 中定义的类；禁止 CSS-in-JS 和 UI 框架
- **弹窗**：受控组件模式，`visible` prop 控制显示，`onClose` prop 关闭回调
- **状态管理**：组件内 `useState`，禁止引入全局状态库
- **外壳通信**：需要通知外壳时用 `window.parent?.postMessage()`
```

- [ ] **Step 3: Commit**

```bash
git add bigPlayer/client/constraint.md bigPlayer/admin/constraint.md
git commit -m "docs: update constraint.md with framework conventions

- client: UniApp tag rules, screen switch postMessage, Tailwind priority
- admin: React CSS-only, controlled modal, useState-only state

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Would you like me to **continue writing the remaining tasks** (Tasks 8-26), or would you prefer to **execute this first batch of 7 tasks** and then I can generate the next batch?