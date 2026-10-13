/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 階段二:Supabase 專案網址(公開值)。沒填就使用示範模式。 */
  readonly VITE_SUPABASE_URL?: string
  /** 階段二:Supabase 的 anon / publishable key(公開值)。不可以放 service_role / secret key。 */
  readonly VITE_SUPABASE_ANON_KEY?: string
}
