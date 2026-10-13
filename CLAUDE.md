# 匿名聊天室

一個不用登入的匿名聊天室,所有人在同一間,部署在 GitHub Pages,即時傳訊用 Supabase。

## 規則

- **開始任何工作前,先讀 `docs/architecture.md`。**需求在 `docs/requirements.md`。
- **目前在「階段二」**:前端已完成並上線,正在接上 Supabase。畫面層(`screens/`、`components/`、`hooks/`)不可以直接引用 Supabase,只能透過 `services/`。Supabase 的設定步驟見 `supabase/setup.md`,**不使用 Supabase CLI**。
- **不可以把金鑰檔案 commit 進 git**:`.env`、`.env.local` 等 `.env*` 檔案都不能進 git(只有 `.env.example` 可以,且值必須是空的)。service_role / secret key 和資料庫密碼不得寫進任何專案檔案。commit 前先跑 `git status` 確認。
