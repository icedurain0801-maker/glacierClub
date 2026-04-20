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
