import { MockChatService } from './mockChatService'
import type { ChatService } from './types'

// 畫面層只從這裡拿「聊天服務」,不知道背後是假資料還是 Supabase。
// 階段二:新增 supabaseChatService.ts,在這裡依設定(有沒有 Supabase 金鑰)決定用哪一個。
export const chatService: ChatService = new MockChatService()
