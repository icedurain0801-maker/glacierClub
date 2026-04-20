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
