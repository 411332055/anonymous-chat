import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 的網址是 https://<帳號>.github.io/anonymous-chat/,網頁在子路徑下。
// 這裡的 base 必須和 repo 名稱一致,否則部署後會找不到檔案、畫面一片空白。
export default defineConfig({
  base: '/anonymous-chat/',
  plugins: [react()],
})
