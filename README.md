# anonymous-chat

一個不用登入的匿名聊天室。所有人在同一間,電腦和手機都能用。

- 需求:[docs/requirements.md](docs/requirements.md)
- 架構:[docs/architecture.md](docs/architecture.md)
- 視覺設計:[docs/design.md](docs/design.md)(設計稿:`docs/design/chat-design.html`)

目前在**階段二**:前端已接上 Supabase,可以多人即時聊天。沒有設定 Supabase 的網址與金鑰時,自動使用示範模式(假資料)。Supabase 的設定見 [supabase/setup.md](supabase/setup.md)。

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

## 新增功能(超出標準版的部分)

| 等級 | 功能 | 位置 |
|---|---|---|
| A 只在自己的畫面上 | 分頁標題顯示未讀數:`(3) 匿名聊天室` | `src/hooks/useUnreadTitle.ts` |
| B 和所有人即時同步 | 「○○ 正在輸入…」 | `src/services/typingTracker.ts`、`src/components/TypingIndicator.tsx` |
| C 伺服器端強制的規則 | 資料庫端的送出頻率限制與髒話過濾(Postgres 觸發器) | `supabase/server_rules.sql` |
| A 只在自己的畫面上(同級) | 前端髒話過濾、送出頻率提示、傳送中/傳送失敗與重送 | `src/lib/profanity.ts`、`src/components/MessageInput.tsx`、`src/hooks/useChat.ts` |

詳細說明、已知限制與驗證項目見 [docs/architecture.md](docs/architecture.md) 最後的〈新增功能〉一節。

## 連接 Supabase

在專案根目錄建立 `.env.local`(內容照 `.env.example`),填入 Supabase 的 Project URL 與 publishable key。重新啟動 `npm run dev` 就會連到 Supabase。第一次設定還要在 Supabase 的 SQL Editor 執行 `supabase/setup.md` 與 `supabase/server_rules.sql` 裡的 SQL。

## 示範模式(沒設定 Supabase 時)

- 機器人(小明、Alice、阿宏…)會定時說話、進出。
- 同一個瀏覽器開兩個分頁,用不同代號,就能互相聊天。用相同代號,第二個會被擋下。
- 畫面最上方的「模擬斷線」按鈕可以測試斷線重連的畫面。
- 訊息不會傳給其他裝置。

## 金鑰

只會用到 Project URL 與 publishable(anon)key,這兩個是公開值。**絕對不要**使用或保存 service_role / secret key 與資料庫密碼。規則見 `docs/architecture.md` 第 8 節。`.env*` 檔案已被 `.gitignore` 忽略,不可以 commit(只有值為空的 `.env.example` 可以)。

## 部署

推到 `main` 分支後,GitHub Actions(`.github/workflows/deploy.yml`)會自動建置並發布到 GitHub Pages。第一次需要到 repo 的 Settings → Pages,把 Source 設成「GitHub Actions」。
