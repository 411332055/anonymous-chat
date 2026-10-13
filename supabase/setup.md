# Supabase 設定(階段二)

這份文件記錄在 Supabase 後台做過的設定。**不使用 Supabase CLI**,全部在網頁上完成。

## 需要的東西

| 項目 | 說明 |
|---|---|
| Supabase 專案 | 免費方案、區域 Northeast Asia (Tokyo) |
| `messages` 資料表 | 存聊天訊息 |
| RLS 權限規則 | 匿名者只能讀取、新增;不能改、不能刪 |
| Realtime | `messages` 加入 `supabase_realtime`(新訊息即時通知);在線名單用 Presence,不需事先設定 |

## 步驟

1. 登入 https://supabase.com(可用 GitHub 登入),建立 Organization(Personal、Free)與專案。資料庫密碼用「Generate a password」產生,**存在密碼管理工具,不要寫進任何檔案、不要貼給任何人**,這個專案用不到它。
2. 左側 **SQL Editor** → New query,貼上下面的 SQL,按 Run:

```sql
-- 1. 訊息表(欄位長度限制由資料庫強制檢查)
create table public.messages (
  id        bigint generated always as identity primary key,
  nickname  text        not null check (char_length(nickname) between 1 and 12),
  client_id text        not null check (char_length(client_id) between 1 and 64),
  text      text        not null check (char_length(text) between 1 and 200),
  sent_at   timestamptz not null default now()
);

-- 2. 打開 RLS,只允許「讀取」和「新增」(沒寫的動作一律拒絕,所以不能改、不能刪)
alter table public.messages enable row level security;

create policy "anon can read messages"
  on public.messages for select to anon using (true);

create policy "anon can insert messages"
  on public.messages for insert to anon with check (true);

-- 3. 欄位層級權限:匿名者不能自己填 id 和時間,時間一律由資料庫蓋章
revoke all on public.messages from anon, authenticated;
grant select on public.messages to anon;
grant insert (nickname, client_id, text) on public.messages to anon;

-- 4. 讓新訊息能即時通知
alter publication supabase_realtime add table public.messages;
```

3. 左側 **Table Editor** → `messages`,確認工具列顯示「2 RLS policies」,沒有「RLS disabled」警告。
4. **Project Settings → API Keys**,複製 **Project URL** 與 **Publishable key**(舊版介面叫 anon key)。**不要複製 Secret / service_role key。**

## 前端怎麼取得這兩個值

| 場合 | 位置 |
|---|---|
| 自己電腦 | 專案根目錄的 `.env.local`(被 `.gitignore` 忽略,不進 git),內容見 `.env.example` |
| 正式網站 | GitHub repo → Settings → Secrets and variables → Actions → **Variables**:`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` |

沒有設定這兩個值時,前端自動使用示範模式(假資料)。

## 權限驗證結果

用公開的 publishable key、以匿名身分直接呼叫資料庫的 REST 介面測試:

| 測試 | 預期 | 結果 |
|---|---|---|
| 讀取訊息 | 成功 | 通過 |
| 新增合法訊息 | 成功,時間由資料庫蓋章 | 通過 |
| 新增 201 字訊息 | 被拒絕 | 通過(check constraint) |
| 代號 13 字 | 被拒絕 | 通過(check constraint) |
| 內容空白 | 被拒絕 | 通過(check constraint) |
| 自己填 `sent_at` | 被拒絕 | 通過(permission denied) |
| 自己填 `id` | 被拒絕 | 通過 |
| 修改訊息 | 被拒絕 | 通過(permission denied) |
| 刪除訊息 | 被拒絕 | 通過(permission denied) |

## 清除測試資料

匿名身分刪不掉訊息(這是刻意的)。要清掉測試訊息時,在 SQL Editor 執行(只有你登入後台才做得到):

```sql
delete from public.messages;
```

## 免費方案要留意

> 以下是撰寫時的大致情況,請以 Supabase 官方定價頁為準。

- **閒置約一週會被自動暫停**,要到後台手動恢復。很久沒人用的聊天室,再打開可能連不上。
- 同時連線人數、每秒訊息數都有上限;資料庫容量約 500 MB,純文字訊息短期內不會滿。
- 髒話過濾與送出頻率限制只在前端做,有技術的人可以繞過直接送資料(見 `docs/architecture.md` 第 9.2 節)。
