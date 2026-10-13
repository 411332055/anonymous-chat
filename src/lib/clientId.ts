// clientId:這個瀏覽器(或分頁)的隨機識別碼,用來判斷「這則訊息是不是我發的」。
// 它不是密碼,不具保密功能。

export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getOrCreate(storage: Storage, key: string): string {
  try {
    let id = storage.getItem(key)
    if (!id) {
      id = randomId()
      storage.setItem(key, id)
    }
    return id
  } catch {
    return randomId()
  }
}

/** 整個瀏覽器共用一個(關掉分頁也不變)。正式的 Supabase 版本用這個。 */
export function getBrowserClientId(): string {
  return getOrCreate(localStorage, 'anonymous-chat:client-id')
}

/** 每個分頁各自一個(重新整理不變)。示範模式用這個,
 *  這樣同一個瀏覽器開兩個分頁,才能當成兩個不同的人來測試。 */
export function getTabClientId(): string {
  return getOrCreate(sessionStorage, 'anonymous-chat:tab-client-id')
}
