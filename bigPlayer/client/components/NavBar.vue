<template>
  <view class="navbar flex items-center justify-between px-4 h-14 bg-gradient-to-b from-primary to-primary/80 text-white">
    <!-- 返回按钮（可选） -->
    <text v-if="showBack" class="navbar-back text-2xl cursor-pointer" @click="handleBack">‹</text>
    <view v-else class="w-8"></view>

    <!-- 标题 -->
    <text class="navbar-title text-center flex-1 text-lg font-semibold">{{ title }}</text>

    <!-- 占位符保持布局平衡 -->
    <view class="w-8"></view>
  </view>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'

defineProps({
  title: String,
  showBack: Boolean
})

const emit = defineEmits(['back'])

const handleBack = () => {
  emit('back')
}
</script>

<style scoped>
.navbar {
  /* 渐变蓝色背景 */
  background: linear-gradient(180deg, #3ab4e8 0%, #5ec8f0 100%);
}

.navbar-back {
  /* 返回按钮样式 */
  font-size: 32px;
  line-height: 1;
  min-width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.navbar-title {
  /* 标题样式 */
  color: #ffffff;
}
</style>
