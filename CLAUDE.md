# 匿名聊天室

一個不用登入的匿名聊天室,所有人在同一間,部署在 GitHub Pages,即時傳訊用 Supabase。

## 規則

- **開始任何工作前,先讀 `docs/architecture.md`。**需求在 `docs/requirements.md`。
- **目前在「階段一」**:只做前端,使用假資料來源(mock),不接 Supabase。接 Supabase 是階段二,不要提前做。
- **不可以把金鑰檔案 commit 進 git**:`.env`、`.env.local` 等 `.env*` 檔案都不能進 git(只有 `.env.example` 可以,且值必須是空的)。service_role / secret key 和資料庫密碼不得寫進任何專案檔案。commit 前先跑 `git status` 確認。
