// 「誰還在線上」的判斷,不完全依賴伺服器通知對方離開。
//
// 為什麼需要:Supabase 的在線狀態(Presence)是靠伺服器發現連線斷了,才通知大家「某人離開」。
// 如果這個通知被延遲或漏掉(伺服器忙、網路被直接切斷、瀏覽器被強制結束),
// 名單上就會一直留著已經離開的人。
//
// 做法:每個人每隔幾秒就更新一次自己的「心跳」(一個一直變動的數字)。
// 我們用「自己的時鐘」記錄「最後一次看到這個人的心跳有變動」是什麼時候,
// 太久沒變動就視為已離開。這樣不需要比較不同裝置的時鐘,也不怕裝置時間不準。

export interface LivenessEntry {
  clientId: string
  /** 對方的心跳數字。null 代表對方是舊版(沒有心跳),一律視為在線 */
  beat: number | null
}

export class PresenceLiveness {
  private ttlMs: number
  private seen = new Map<string, { beat: number; at: number }>()

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  /** 傳入「目前頻道上看得到的所有人」,回傳其中「仍然活著」的 clientId */
  update(entries: LivenessEntry[], now: number): Set<string> {
    const present = new Set(entries.map((e) => e.clientId))
    for (const id of [...this.seen.keys()]) if (!present.has(id)) this.seen.delete(id)

    const alive = new Set<string>()
    for (const e of entries) {
      if (e.beat === null) {
        alive.add(e.clientId) // 舊版沒有心跳,無法判斷,當作在線
        continue
      }
      const prev = this.seen.get(e.clientId)
      if (!prev || prev.beat !== e.beat) this.seen.set(e.clientId, { beat: e.beat, at: now })
      const at = this.seen.get(e.clientId)!.at
      if (now - at <= this.ttlMs) alive.add(e.clientId)
    }
    return alive
  }
}
