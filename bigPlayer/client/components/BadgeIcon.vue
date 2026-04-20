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
