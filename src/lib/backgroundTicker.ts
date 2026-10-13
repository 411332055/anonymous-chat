// 不受「背景分頁節流」影響的計時器。
//
// 瀏覽器會把「在背景的分頁」裡的 setInterval 大幅放慢(最慢可能一分鐘才跑一次)。
// 我們需要固定的節奏來:① 定期更新自己的心跳 ② 定期核對「誰還在線上」。
// 放慢的話,別人會誤以為我離開了,或是我很久才發現別人離開了。
//
// 做法:把計時放在 Web Worker(獨立的背景執行緒)裡,它不會被節流,
// 每次時間到就傳訊息回主頁面,主頁面收到訊息再做事。
// 如果瀏覽器不支援 Worker,就退回一般的 setInterval。

export function startTicker(intervalMs: number, onTick: () => void): () => void {
  try {
    const source = `setInterval(function () { postMessage(0) }, ${Math.round(intervalMs)})`
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const worker = new Worker(url)
    worker.onmessage = () => onTick()
    return () => {
      worker.terminate()
      URL.revokeObjectURL(url)
    }
  } catch {
    const id = setInterval(onTick, intervalMs)
    return () => clearInterval(id)
  }
}
