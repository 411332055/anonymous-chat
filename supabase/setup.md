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
2. 左側 **SQL Editor** → New query,貼上下面的 SQL,按 Run。
   **這段只有「第一次建表」才執行。如果 `messages` 表已經建過,再執行會出現「relation \"messages\" already exists」錯誤,而且整次執行都不會生效。** 已經建過表的話,請改執行 `supabase/server_rules.sql`(見下面「伺服器端規則」)。

```sql
-- 1. 訊息表(欄位長度限制由資料庫強制檢查)
create table public.messages (
  id        bigint generated always as identity primary key,
  nickname  text        not null check (char_length(nickname) between 1 and 24),
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

## 伺服器端規則(`server_rules.sql`)

建好資料表之後,再執行 `supabase/server_rules.sql`(整份貼進 SQL Editor,按 Run)。它**可以重複執行**,不會重複建立。內容:

| 規則 | 說明 |
|---|---|
| 代號 1–24 字 | 把資料庫的代號長度檢查放寬到 24 字(最初是 12 字)。**前端的上限在 `src/lib/validate.ts`,兩邊要一致**;資料庫沒放寬前,前端讓 13 字以上的代號進入,送出訊息會失敗 |
| 送出頻率限制 | 同一個識別碼(`client_id`)5 秒內最多 8 則,超過的會被拒絕(錯誤訊息 `rate_limited`) |
| 髒話過濾 | 訊息內容裡的髒話,在存進資料庫前就被換成同長度的 `*` |
| 代號不可含髒話 | 含髒話的代號無法發言(錯誤訊息 `nickname_not_allowed`) |

髒話清單在 SQL 裡和前端 `src/lib/badWords.ts` 各有一份,要改請兩邊一起改。

## 前端怎麼取得這兩個值

| 場合 | 位置 |
|---|---|
| 自己電腦 | 專案根目錄的 `.env.local`(被 `.gitignore` 忽略,不進 git),內容見 `.env.example` |
| 正式網站 | GitHub repo → Settings → Secrets and variables → Actions → **Variables**:`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` |

沒有設定這兩個值時,前端自動使用示範模式(假資料)。

## 權限驗證結果

用公開的 publishable key、以匿名身分、**不經過網頁**,直接呼叫資料庫的 REST 介面測試(2026-10-13):

| 測試 | 預期 | 結果 |
|---|---|---|
| 讀取訊息 | 成功 | 通過 |
| 新增合法訊息 | 成功,時間由資料庫蓋章 | 通過 |
| 新增 201 字訊息 | 被拒絕 | 通過(check constraint) |
| 內容空白 | 被拒絕 | 通過(check constraint) |
| 自己填 `sent_at` | 被拒絕 | 通過(permission denied) |
| 自己填 `id` | 被拒絕 | 通過 |
| 修改訊息 | 被拒絕 | 通過(permission denied) |
| 刪除訊息 | 被拒絕 | 通過(permission denied) |

### 伺服器端規則(`server_rules.sql`)的驗證結果

| 測試 | 預期 | 結果 |
|---|---|---|
| 代號 24 字 | 可以發言 | 通過 |
| 代號 25 字 | 被拒絕 | 通過(check constraint) |
| 代號含髒話(`shit`) | 被拒絕 `nickname_not_allowed` | 通過 |
| 直接送「hello SHIT world 幹你娘 bastard! 他媽的 fine」 | 存進去的內容已是星號 | 通過:`hello **** world *** *******! *** fine` |
| 正常單字 `Class`、`ASS`(不在清單內) | 不被誤傷 | 通過 |
| 英文單字後綴(`shitty`、`fuckable`) | 整個單字換成星號 | 通過 |
| 同一識別碼同時送 14 則 | 成功 8、被擋 6 | 通過:成功 8、被擋 6 |
| 同一識別碼同時送 30 則(兩輪) | 成功 ≤ 8 | 第 1 輪成功 10、被擋 20;第 2 輪成功 8、被擋 22 |

**已知限制:** 頻率限制是在「新增之前查最近 5 秒有幾則」,極端的瞬間併發下,兩個請求可能同時查到「還沒滿」而都放行,所以實測 30 個同時送出時最多放行了 10 則(上限是 8)。它仍然擋下了大部分的洗版(30 則擋下 20 則以上),但不是精確的硬上限。若要精確,可以在觸發器開頭加上依識別碼加鎖(`pg_advisory_xact_lock`)讓同一識別碼的新增排隊,這一版沒做。另外頻率是依「識別碼」計算,偽造識別碼就能繞過(見 `docs/architecture.md` 9.2)。

## 清除測試資料

匿名身分刪不掉訊息(這是刻意的)。要清掉測試訊息時,在 SQL Editor 執行(只有你登入後台才做得到):

```sql
delete from public.messages;
```

## 免費方案的限制

> 2026-10-13 對照官方文件整理,數字日後可能調整,部署前請再看一次官方頁面:
> [Pricing](https://supabase.com/pricing)、[Realtime limits](https://supabase.com/docs/guides/realtime/limits)、[Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

| 項目 | 免費方案 | 對這個聊天室的意義 |
|---|---|---|
| Realtime 同時連線數 | 200 | 同時在線超過 200 人,新的人會連不上 |
| Realtime 每秒訊息數 | 100 | 一般聊天不會碰到 |
| Presence(在線狀態)每秒訊息數 | 20 | 很多人在同一秒進出時可能被限速,在線名單會晚一點更新 |
| 頻道每秒加入次數 | 100 | 同上 |
| Realtime 每月訊息數 | 200 萬 | 每則訊息會推給每一個在線的人,人多、話多時要留意 |
| 資料庫容量 | 500 MB | 純文字訊息,短期內不會滿 |
| 流量(egress) | 5 GB / 月 | 一般不會碰到 |
| 專案數 | 最多 2 個啟用中 | |
| **閒置暫停** | **一週內資料庫活動太少會被自動暫停** | **暫停後聊天室會連不上,要到 Supabase 後台手動恢復**(暫停後 90 天內可恢復) |

- 避免被暫停:只要每週有人用,通常就不會被暫停。長時間沒人用的話,要自己定期開啟聊天室或在後台確認。
- 髒話過濾與送出頻率限制只在前端做,有技術的人可以繞過直接送資料(見 `docs/architecture.md` 第 9.2 節)。
