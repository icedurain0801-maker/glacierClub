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
