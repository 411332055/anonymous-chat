import type { ChatService } from '../services/types'

/** 示範模式橫幅(僅階段一,資料來源是假的時才顯示)。右側的「模擬斷線」是測試用按鈕。 */
export function DemoBanner({ service, offline = false }: { service: ChatService; offline?: boolean }) {
  if (!service.isDemo) return null
  return (
    <div className="demo-banner">
      <span>示範模式:訊息不會傳給其他裝置</span>
      {service.simulate && (
        <button
          type="button"
          className="demo-sim"
          onClick={() => service.simulate?.disconnect()}
          disabled={offline}
        >
          模擬斷線
        </button>
      )}
    </div>
  )
}
