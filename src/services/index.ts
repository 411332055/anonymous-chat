import { MockChatService } from './mockChatService'
import { SupabaseChatService } from './supabaseChatService'
import type { ChatService } from './types'

// 畫面層只從這裡拿「聊天服務」,不知道背後是假資料還是 Supabase。
// 有填 Supabase 的網址和公開金鑰就用 Supabase;沒填就自動用示範模式(假資料)。
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const chatService: ChatService =
  url && anonKey ? new SupabaseChatService(url, anonKey) : new MockChatService()
