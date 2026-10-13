-- ============================================================================
-- 伺服器端規則(在 Supabase 的 SQL Editor 執行,可重複執行,不會重複建立)
--
-- 前端的檢查只是方便一般使用者;有技術的人可以不經過網頁、直接用公開的金鑰送資料。
-- 這份 SQL 把規則放進「資料庫」裡,不管訊息從哪裡來,都一定會被檢查:
--
--   1. 代號長度 1–24 字(放寬原本的 12 字上限)
--   2. 送出頻率限制:同一個識別碼,5 秒內最多 8 則
--   3. 髒話過濾:訊息內容裡的髒話在存進資料庫前,就被換成同長度的 *
--   4. 代號不可含髒話
-- ============================================================================

-- 1. 代號長度:1–24 字
alter table public.messages drop constraint if exists messages_nickname_check;
alter table public.messages add constraint messages_nickname_check
  check (char_length(nickname) between 1 and 24);

-- 2. 加快「查這個識別碼最近送了幾則」
create index if not exists messages_client_sent_idx
  on public.messages (client_id, sent_at desc);

-- 3. 髒話過濾函式(清單要和前端 src/lib/badWords.ts 保持一致)
--    中文:只要「包含」就換掉;英文:整個單字(含後面接的字母)換掉,不分大小寫。
create or replace function public.mask_profanity(input text)
returns text
language plpgsql
immutable
as $$
declare
  result text := input;
  m text[];
  w text;
begin
  -- 較長的詞放前面,避免「他媽的」被「媽的」先拆掉
  foreach w in array array[
    '幹你娘', '幹您娘', '操你媽', '操你妈', '他媽的', '他妈的', '王八蛋',
    '媽的', '妈的', '靠北', '靠杯', '白痴', '白癡', '智障', '腦殘', '去死'
  ] loop
    result := replace(result, w, repeat('*', char_length(w)));
  end loop;

  for m in
    select regexp_matches(result, '\m(?:fuck|shit|bitch|asshole|bastard)\w*', 'gi')
  loop
    result := replace(result, m[1], repeat('*', char_length(m[1])));
  end loop;

  return result;
end;
$$;

-- 4. 新增訊息前的檢查:代號不可含髒話 → 送出頻率 → 過濾內容
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
as $$
begin
  if public.mask_profanity(new.nickname) <> new.nickname then
    raise exception 'nickname_not_allowed';
  end if;

  if (
    select count(*) from public.messages
    where client_id = new.client_id
      and sent_at > now() - interval '5 seconds'
  ) >= 8 then
    raise exception 'rate_limited';
  end if;

  new.text := public.mask_profanity(new.text);
  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();
