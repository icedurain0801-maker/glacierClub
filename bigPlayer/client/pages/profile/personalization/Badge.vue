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
