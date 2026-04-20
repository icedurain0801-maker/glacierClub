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
