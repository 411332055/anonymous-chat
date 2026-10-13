// 階段一的假資料:機器人的名單與台詞。這些只用來讓示範模式看起來有人在聊天。

export const BOT_NAMES = ['小明', 'Alice', '阿宏', '夜貓子', '咖啡']

/** 一開始就在線的機器人 */
export const BOTS_ONLINE_AT_START = ['小明', 'Alice', '阿宏']

export const BOT_LINES: string[] = [
  '大家晚安',
  '今天好累喔',
  '有人在嗎?',
  '剛下班,終於可以坐下來了',
  '你們晚餐吃什麼?',
  '我剛剛發現一間不錯的店\nhttps://example.com/menu',
  '哈哈哈哈哈',
  '真的假的',
  '這個週末有人要出去嗎',
  '我今天寫程式寫到眼睛痛,那個 bug 真的是 shit',
  '推薦一首歌給大家,聽了心情會變好',
  '突然好想吃宵夜',
  '明天又要上班了',
  '我也是!',
  '誰懂啊',
  '先去洗澡,等等回來',
  '剛剛下雨你們那邊有淋到嗎',
  '笑死',
  '好喔,那我先去睡了',
  '早知道就不要熬夜了',
  '這首歌是不是很好聽\nhttps://example.com/song',
  '我養的貓又把杯子推下桌了',
  '有沒有人也在加班',
  '對啊,我也這樣覺得',
]

/** 啟動時預先放進歷史裡的對話(時間往前推) */
export const SEED_CONVERSATION: Array<{ bot: string; text: string; minutesAgo: number }> = [
  { bot: 'Alice', text: '大家好,今天有人要聊天嗎?', minutesAgo: 24 },
  { bot: '小明', text: '有啊,剛好下班', minutesAgo: 22 },
  { bot: '阿宏', text: '我也在,剛吃完飯', minutesAgo: 20 },
  { bot: 'Alice', text: '你們晚餐吃什麼?', minutesAgo: 18 },
  { bot: '小明', text: '便利商店的飯糰,沒時間煮', minutesAgo: 17 },
  { bot: '阿宏', text: '哈哈哈 我也是', minutesAgo: 15 },
  { bot: 'Alice', text: '這樣不行啦,要吃好一點', minutesAgo: 12 },
  { bot: '小明', text: '好啦好啦,明天我認真吃', minutesAgo: 9 },
  { bot: '阿宏', text: '推薦一首歌給大家\nhttps://example.com/song', minutesAgo: 5 },
  { bot: 'Alice', text: '好聽!', minutesAgo: 3 },
]
