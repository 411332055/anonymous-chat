# anonymous-chat

一個不用登入的匿名聊天室。所有人在同一間,電腦和手機都能用。

- 需求:[docs/requirements.md](docs/requirements.md)
- 架構:[docs/architecture.md](docs/architecture.md)
- 視覺設計:[docs/design.md](docs/design.md)(設計稿:`docs/design/chat-design.html`)

目前在**階段一**:只有前端,使用假資料來源(示範模式),不連 Supabase。

## 在自己的電腦跑起來

需要 Node.js 20 以上。

```
npm install
npm run dev
```

打開終端機顯示的網址。因為要部署到 GitHub Pages 的子路徑,網址會是 `http://localhost:5173/anonymous-chat/`(最後的 `/anonymous-chat/` 不能少)。

## 其他指令

```
npm run build     檢查型別並建置到 dist/
npm run preview   預覽建置後的網站
```

## 示範模式怎麼玩

- 機器人(小明、Alice、阿宏…)會定時說話、進出。
- 同一個瀏覽器開兩個分頁,用不同代號,就能互相聊天。用相同代號,第二個會被擋下。
- 畫面最上方的「模擬斷線」按鈕可以測試斷線重連的畫面。
- 訊息不會傳給其他裝置;那要等階段二接上 Supabase。

## 金鑰

階段一不需要任何金鑰。階段二才會用到,規則見 `docs/architecture.md` 第 8 節。`.env*` 檔案已被 `.gitignore` 忽略,不可以 commit。

## 部署

推到 `main` 分支後,GitHub Actions(`.github/workflows/deploy.yml`)會自動建置並發布到 GitHub Pages。第一次需要到 repo 的 Settings → Pages,把 Source 設成「GitHub Actions」。
