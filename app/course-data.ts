export type Chapter = {
  no: number;
  title: string;
  range: string;
  badge: string;
  color: string;
  objective: string;
  overview: string;
  lessonPoints: string[];
  videoIds: string[];
  videoTitles: string[];
  checks: { id: string; label: string }[];
  submissionTasks?: {
    id: string;
    title: string;
    videoTitle: string;
    description: string;
    checkIds: string[];
  }[];
};

export const playlistUrl =
  "https://www.youtube.com/playlist?list=PLZPSeHCk8Xgz9XLsonQTJHyqp-9Zj1v7R";

export const playlistId = "PLZPSeHCk8Xgz9XLsonQTJHyqp-9Zj1v7R";

export function playlistEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}?list=${playlistId}`;
}

export const chapters: Chapter[] = [
  {
    no: 1,
    title: "Scratch 基本環境",
    range: "第 1 堂",
    badge: "Scratch 探險家",
    color: "green",
    objective: "認識 Scratch 介面，能建立角色並開始用積木描述動作。",
    overview: "本章帶學生進入 Scratch 的基本工作區，熟悉舞台、角色、積木分類與作品儲存方式。完成後，學生應能建立第一個可執行的小程式，並知道如何匯出 .sb3 檔案。",
    lessonPoints: ["找到舞台、角色清單、程式區與積木區。", "練習拖拉積木並按綠旗執行。", "建立第一個 Scratch 檔案並完成儲存。"],
    videoIds: ["NSIGbZ9j3zY"],
    videoTitles: ["01 Scratch 基本操作環境介紹"],
    checks: [
      { id: "save-project", label: "我已將作品下載為 .sb3 檔案，並選擇這個檔案進行上傳檢核。" },
    ],
  },
  {
    no: 2,
    title: "角色前進",
    range: "第 2 堂",
    badge: "移動控制員",
    color: "blue",
    objective: "使用移動、方向與重複積木，讓角色依照指令前進。",
    overview: "本章聚焦角色移動的第一個核心觀念：方向、步數與執行時機。學生會練習讓角色在舞台上依照設定前進，並觀察移動距離與方向改變造成的結果。",
    lessonPoints: ["使用移動、面向方向與重複執行。", "理解綠旗事件與角色動作的關係。", "測試角色在舞台邊界附近的行為。"],
    videoIds: ["-TT0OIgRbgY"],
    videoTitles: ["02 Scratch 角色的移動：前進"],
    checks: [
      { id: "green-flag", label: "按下綠旗後，角色會先回到設定好的初始位置與方向。" },
      { id: "move-block", label: "我有使用前進指令與重複積木，讓角色繞舞台一圈。" },
      { id: "debug-move", label: "角色繞行舞台時不會超出舞台範圍。" },
    ],
  },
  {
    no: 3,
    title: "滑行與座標",
    range: "第 3 堂",
    badge: "座標小高手",
    color: "yellow",
    objective: "使用滑行與 X/Y 座標，讓角色可以移動到指定位置。",
    overview: "本章把移動概念延伸到座標系統，讓學生理解舞台上的 X/Y 位置如何決定角色所在地。透過滑行與定位，學生能設計更精準的角色移動效果。",
    lessonPoints: ["認識 X 座標、Y 座標與舞台中心。", "使用滑行到指定位置做出平順移動。", "比較步數移動與座標移動的差異。"],
    videoIds: ["Jvpr-2X5EJs", "HYsreADflfs"],
    videoTitles: ["03 Scratch 角色移動：滑行", "04 Scratch 角色的移動：XY 座標"],
    checks: [
      { id: "glide-start", label: "滑行作品按下綠旗後，角色會先回到設定好的初始座標。" },
      { id: "glide-loop", label: "使用至少四段滑行到指定位置，讓角色繞舞台一圈。" },
      { id: "glide-random", label: "每一段滑行時間都使用隨機取數積木。" },
      { id: "coordinate-start", label: "座標作品按下綠旗後，角色會先回到設定好的初始座標。" },
      { id: "coordinate-motion", label: "使用重複與改變 X／Y 座標積木，讓角色繞舞台一圈。" },
      { id: "coordinate-boundary", label: "座標移動路線不會超出舞台，最後會回到起點附近。" },
    ],
    submissionTasks: [
      {
        id: "glide",
        title: "作品 1｜滑行移動",
        videoTitle: "03 Scratch 角色移動：滑行",
        description: "上傳使用滑行到指定位置，且滑行時間使用隨機取數的作品。",
        checkIds: ["glide-start", "glide-loop", "glide-random"],
      },
      {
        id: "coordinates",
        title: "作品 2｜XY 座標移動",
        videoTitle: "04 Scratch 角色的移動：XY 座標",
        description: "上傳使用重複與改變 X／Y 座標繞舞台一圈的作品。",
        checkIds: ["coordinate-start", "coordinate-motion", "coordinate-boundary"],
      },
    ],
  },
  {
    no: 4,
    title: "主角精準控制",
    range: "第 4 堂",
    badge: "主角操控師",
    color: "coral",
    objective: "使用鍵盤事件與條件，讓玩家能穩定控制主角。",
    overview: "本章開始進入射擊遊戲的主角控制。學生會使用鍵盤事件或持續偵測按鍵，讓玩家可以控制主角移動，並調整速度與邊界行為。",
    lessonPoints: ["用鍵盤控制主角上下左右移動。", "設定合適速度，讓操作不會太快或太慢。", "處理主角靠近舞台邊緣的狀況。"],
    videoIds: ["Ljh-5RNk0Uk"],
    videoTitles: ["05 遊戲設計主角控制技巧：精確控制"],
    checks: [
      { id: "controller-start", label: "按下綠旗後，主角會回到設定好的初始位置與方向。" },
      { id: "controller-keys", label: "在重複無限次中持續偵測上、下、左、右方向鍵。" },
      { id: "controller-motion", label: "四個方向鍵會正確增加或減少主角的 X／Y 座標。" },
    ],
  },
  {
    no: 5,
    title: "配角移動",
    range: "第 5 堂",
    badge: "配角設計師",
    color: "green",
    objective: "讓配角出現移動、隨機或追蹤等遊戲行為。",
    overview: "本章加入配角或敵人，讓遊戲不再只有主角單獨移動。學生會設計配角的移動方式，例如自動移動、隨機出現或反覆改變位置。",
    lessonPoints: ["建立主角以外的配角或敵人角色。", "讓配角自動移動或改變位置。", "加入隨機性，提升遊戲變化。"],
    videoIds: ["QPD05s8Kc8w"],
    videoTitles: ["06 遊戲設計配角的移動技巧：簡易移動"],
    checks: [
      { id: "supporting-sprite", label: "作品至少有主角與一個會移動的配角。" },
      { id: "supporting-loop", label: "配角按下綠旗後會定位，並在重複無限次中來回滑行。" },
      { id: "supporting-random", label: "配角每一段滑行時間都使用隨機取數積木。" },
    ],
  },
  {
    no: 6,
    title: "主角發射子彈",
    range: "第 6 堂",
    badge: "子彈發射手",
    color: "blue",
    objective: "使用事件與角色控制，讓主角可以發射子彈。",
    overview: "本章設計射擊遊戲的攻擊行為。學生會建立子彈角色或等效物件，讓主角透過按鍵發射，並讓子彈出現、移動與回到準備狀態。",
    lessonPoints: ["建立子彈角色或攻擊物件。", "用按鍵事件觸發發射。", "設定子彈發射後的位置、方向與重置。"],
    videoIds: ["gKWIFFpyW3c"],
    videoTitles: ["07 遊戲設計主角發射子彈技巧"],
    checks: [
      { id: "player-projectile", label: "作品有獨立的子彈角色，按下綠旗時會先隱藏。" },
      { id: "player-launch", label: "按下空白鍵後，子彈會移到主角位置並顯示。" },
      { id: "player-flight", label: "子彈會移動到舞台邊緣，碰到敵人或邊緣後隱藏。" },
    ],
  },
  {
    no: 7,
    title: "配角發射與互動",
    range: "第 7 堂",
    badge: "對戰設計師",
    color: "yellow",
    objective: "讓配角能依遊戲情境發射、碰撞或回應主角行動。",
    overview: "本章讓敵人或配角也能產生行動，建立更完整的對戰互動。學生會練習配角發射、碰撞偵測與遊戲公平性的初步調整。",
    lessonPoints: ["讓配角產生攻擊或互動行為。", "使用碰撞偵測判斷是否命中。", "調整攻擊頻率與位置，讓遊戲可玩。"],
    videoIds: ["K7AhE9D2yJg"],
    videoTitles: ["08 遊戲設計配角發射子彈技巧：初級"],
    checks: [
      { id: "enemy-projectile", label: "作品有獨立的配角子彈，按下綠旗時會先隱藏。" },
      { id: "enemy-launch", label: "配角子彈會重複移到配角位置、顯示並自動發射。" },
      { id: "enemy-collision", label: "配角子彈碰到主角或舞台邊緣後會隱藏。" },
    ],
  },
  {
    no: 8,
    title: "分身技巧",
    range: "第 8 堂",
    badge: "分身魔法師",
    color: "coral",
    objective: "使用分身讓子彈、敵人或效果可以重複產生。",
    overview: "本章導入分身，解決遊戲中同時出現多個子彈、敵人或特效的需求。學生會學習建立分身、讓分身執行動作，並在完成任務後刪除分身。",
    lessonPoints: ["理解本體角色與分身的差異。", "建立分身並讓分身獨立移動。", "在碰撞或離開舞台後刪除分身。"],
    videoIds: ["NeOBcpvmAuw"],
    videoTitles: ["09 遊戲設計配角發射子彈技巧：進階分身"],
    checks: [
      { id: "clone-create", label: "在重複無限次中，會等待隨機時間後建立分身。" },
      { id: "clone-action", label: "分身建立後會顯示、移動並偵測碰撞。" },
      { id: "clone-delete", label: "分身碰到主角或舞台邊緣後會刪除。" },
    ],
  },
  {
    no: 9,
    title: "變數與計分",
    range: "第 9 堂",
    badge: "計分管理員",
    color: "green",
    objective: "使用變數記錄分數、生命或遊戲狀態。",
    overview: "本章使用變數記錄遊戲狀態，讓作品開始有分數、生命或其他可追蹤的數值。學生會練習初始化變數，並在事件發生時改變變數。",
    lessonPoints: ["建立分數、生命或狀態變數。", "在命中、失誤或碰撞時改變數值。", "按綠旗重新開始時重設變數。"],
    videoIds: ["RHICqwxNtWY"],
    videoTitles: ["10 遊戲設計計分技巧：變數設計"],
    checks: [
      { id: "score-variable", label: "作品建立敵人血量或計分類型的變數。" },
      { id: "score-reset", label: "按下綠旗後，會將變數設定為大於零的初始值。" },
      { id: "score-change", label: "攻擊碰到敵人後，會減少同一個變數的數值。" },
    ],
  },
  {
    no: 10,
    title: "勝負判斷",
    range: "第 10 堂",
    badge: "遊戲裁判",
    color: "blue",
    objective: "分別使用廣播與直接判斷，做出完整的勝利與失敗流程。",
    overview: "本章整理遊戲的勝負流程。學生會完成兩個版本：第一個版本用 WIN／LOSE 廣播通知結果角色，第二個版本不使用廣播，讓結果角色直接等待生命值條件成立。",
    lessonPoints: ["設定主角與敵人的生命值歸零條件。", "使用 WIN／LOSE 廣播串接勝負畫面。", "使用等待直到條件直接顯示勝負結果。"],
    videoIds: ["kafiqqrHbQM", "DOsK2b0b5rQ"],
    videoTitles: ["11 遊戲設計勝負判斷：使用廣播", "12 遊戲設計勝負判斷：不使用廣播"],
    checks: [
      { id: "broadcast-conditions", label: "廣播版會判斷主角與敵人的生命值是否歸零。" },
      { id: "broadcast-messages", label: "廣播版會送出並接收 WIN／LOSE 兩種廣播。" },
      { id: "broadcast-results", label: "收到廣播後會顯示勝利或失敗畫面，並停止遊戲。" },
      { id: "direct-conditions", label: "非廣播版會分別判斷主角與敵人的生命值是否歸零。" },
      { id: "direct-wait", label: "非廣播版使用等待直到條件，不包含廣播積木。" },
      { id: "direct-results", label: "條件成立後會直接顯示勝利或失敗畫面，並停止遊戲。" },
    ],
    submissionTasks: [
      {
        id: "broadcast",
        title: "作品 1｜使用廣播的勝負判斷",
        videoTitle: "11 遊戲設計勝負判斷：使用廣播",
        description: "上傳使用 WIN／LOSE 廣播切換勝利與失敗畫面的作品。",
        checkIds: ["broadcast-conditions", "broadcast-messages", "broadcast-results"],
      },
      {
        id: "direct",
        title: "作品 2｜不使用廣播的勝負判斷",
        videoTitle: "12 遊戲設計勝負判斷：不使用廣播",
        description: "上傳使用等待直到生命值條件，直接顯示勝負畫面的作品。",
        checkIds: ["direct-conditions", "direct-wait", "direct-results"],
      },
    ],
  },
  {
    no: 11,
    title: "計時器",
    range: "第 11 堂",
    badge: "時間挑戰者",
    color: "yellow",
    objective: "建立倒數計時器，讓遊戲依照時間限制停止。",
    overview: "本章加入遊戲時間變數。學生會設定時間初始值，在重複結構中每秒減少一次，並在時間歸零時停止遊戲或進入失敗結果。",
    lessonPoints: ["建立並初始化遊戲時間變數。", "每等待一秒將時間減少一。", "時間歸零後停止遊戲或顯示結果。"],
    videoIds: ["F0DISm_jCxw"],
    videoTitles: ["13 遊戲設計簡易時間計時器：正數與倒數"],
    checks: [
      { id: "timer-variable", label: "按下綠旗後會將遊戲時間設定為大於零的初始值。" },
      { id: "timer-countdown", label: "在重複直到時間歸零的流程中，每秒將時間減少一。" },
      { id: "timer-finish", label: "遊戲時間等於零後會停止遊戲或進入結束流程。" },
    ],
  },
  {
    no: 12,
    title: "完整專題：防疫大作戰",
    range: "第 12 堂",
    badge: "防疫大作戰創作者",
    color: "coral",
    objective: "整合前面技巧，完成一個可玩的射擊遊戲作品。",
    overview: "本章是課程專題整合，學生會把主角控制、敵人、發射、碰撞、計分、計時與勝負判斷組合成一個完整作品。完成後，作品應能被同學完整試玩。",
    lessonPoints: ["整理開始、遊玩與結束流程。", "整合控制、攻擊、敵人、分數與勝負。", "完成試玩、修正並準備上傳作品。"],
    videoIds: ["7tiS3n6N4_c"],
    videoTitles: ["14 防疫大作戰：遊戲頁面動作設計實作"],
    checks: [
      { id: "complete-game", label: "我的作品有開始、遊玩與結束流程。" },
      { id: "core-systems", label: "我整合了控制、敵人、攻擊、計分與勝負條件。" },
      { id: "playtest", label: "我請自己或同學完整試玩過一次並修正問題。" },
    ],
  },
];
