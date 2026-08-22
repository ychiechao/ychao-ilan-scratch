export type Chapter = {
  no: number;
  title: string;
  range: string;
  badge: string;
  color: string;
  objective: string;
  overview: string;
  lessonPoints: string[];
  videoStartIndex: number;
  videoTitles: string[];
  checks: { id: string; label: string }[];
};

export const playlistUrl =
  "https://www.youtube.com/playlist?list=PLZPSeHCk8Xgz9XLsonQTJHyqp-9Zj1v7R";

export const playlistId = "PLZPSeHCk8Xgz9XLsonQTJHyqp-9Zj1v7R";

export function playlistEmbedUrl(videoStartIndex: number) {
  return `https://www.youtube.com/embed/videoseries?list=${playlistId}&index=${videoStartIndex}`;
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
    videoStartIndex: 0,
    videoTitles: ["01_Scratch基本操作環境介紹"],
    checks: [
      { id: "open-editor", label: "我能開啟 Scratch 3 編輯器並找到舞台、角色與積木區。" },
      { id: "save-project", label: "我的作品已經存成 .sb3 檔案。" },
      { id: "first-script", label: "我至少完成一段角色可以執行的程式。" },
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
    videoStartIndex: 1,
    videoTitles: ["02_Scratch_角色的前進"],
    checks: [
      { id: "move-block", label: "我有使用移動或方向相關積木。" },
      { id: "green-flag", label: "按下綠旗後，角色會照我的設定移動。" },
      { id: "debug-move", label: "我測試過角色不會立刻跑出舞台。" },
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
    videoStartIndex: 2,
    videoTitles: ["03_Scratch_角色移動-滑行", "04_Scratch_角色的前進_利用XY座標"],
    checks: [
      { id: "xy", label: "我知道 X 座標與 Y 座標如何影響角色位置。" },
      { id: "glide", label: "我有使用滑行或定位到座標的效果。" },
      { id: "repeat-test", label: "我重複測試不同座標，角色位置符合預期。" },
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
    videoStartIndex: 4,
    videoTitles: ["05_射擊遊戲-主角控制"],
    checks: [
      { id: "keyboard", label: "我的作品有鍵盤控制主角移動。" },
      { id: "smooth-control", label: "主角移動速度適中，容易操作。" },
      { id: "boundary", label: "我有處理角色靠近舞台邊緣的狀況。" },
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
    videoStartIndex: 5,
    videoTitles: ["06_射擊遊戲-配角控制"],
    checks: [
      { id: "second-sprite", label: "我的作品至少有主角與配角。" },
      { id: "enemy-motion", label: "配角會自動移動或改變位置。" },
      { id: "randomness", label: "我有加入隨機或重複行為，讓遊戲不只執行一次。" },
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
    videoStartIndex: 6,
    videoTitles: ["07_主角發射子彈技巧"],
    checks: [
      { id: "bullet-sprite", label: "我的作品有子彈角色或等效的攻擊物件。" },
      { id: "shoot-key", label: "玩家可以用按鍵或事件發射子彈。" },
      { id: "bullet-reset", label: "子彈發射後會回到合理位置或重新出現。" },
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
    videoStartIndex: 7,
    videoTitles: ["08_配角發射子彈技巧"],
    checks: [
      { id: "enemy-action", label: "配角會主動發射或產生攻擊行為。" },
      { id: "collision", label: "我的作品有偵測碰到角色、邊緣或物件的條件。" },
      { id: "fairness", label: "我測試過遊戲難度，不會一開始就失敗。" },
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
    videoStartIndex: 8,
    videoTitles: ["09_分身的元件使用"],
    checks: [
      { id: "clone-create", label: "我的作品有建立分身的設計。" },
      { id: "clone-delete", label: "分身完成任務後會刪除或消失。" },
      { id: "multiple-objects", label: "我測試過多個分身同時存在時仍可正常運作。" },
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
    videoStartIndex: 9,
    videoTitles: ["10_遊戲的計分-變數使用"],
    checks: [
      { id: "score-variable", label: "我的作品有分數、生命或類似變數。" },
      { id: "score-change", label: "碰撞或事件發生時，變數會正確改變。" },
      { id: "score-reset", label: "按綠旗重新開始時，變數會回到初始值。" },
    ],
  },
  {
    no: 10,
    title: "計時器",
    range: "第 10 堂",
    badge: "時間挑戰者",
    color: "blue",
    objective: "建立正數、倒數或時間限制，讓遊戲有節奏與挑戰。",
    overview: "本章加入時間機制，讓遊戲可以有倒數、計時或時間限制。學生會用變數和重複結構建立計時器，並設計時間到時的結果。",
    lessonPoints: ["建立正數計時或倒數計時變數。", "讓時間隨遊戲進行自動變化。", "設計時間到後的停止、勝負或提示。"],
    videoStartIndex: 10,
    videoTitles: ["11_簡易的計數器-正數與倒數"],
    checks: [
      { id: "timer-variable", label: "我的作品有計時或倒數變數。" },
      { id: "timer-change", label: "時間會隨遊戲進行自動改變。" },
      { id: "timer-condition", label: "時間到時，遊戲會出現對應結果。" },
    ],
  },
  {
    no: 11,
    title: "勝負判斷與音效",
    range: "第 11 堂",
    badge: "遊戲裁判",
    color: "yellow",
    objective: "使用條件、廣播、音效或背景切換做出勝負流程。",
    overview: "本章整理遊戲流程，讓作品有明確的勝利、失敗、音效與畫面提示。學生會運用條件判斷、廣播或背景切換，做出完整的遊戲狀態。",
    lessonPoints: ["設定勝利與失敗條件。", "用廣播或狀態切換串接遊戲流程。", "加入音效、背景音樂或畫面提示提升完成度。"],
    videoStartIndex: 11,
    videoTitles: ["12_遊戲的勝負-廣播的應用", "13_遊戲設計技巧-背景音樂與音效應用"],
    checks: [
      { id: "win-lose", label: "我的作品有勝利或失敗條件。" },
      { id: "broadcast-or-state", label: "我有使用廣播或清楚的狀態切換流程。" },
      { id: "sound", label: "我的作品有音效、背景音樂或畫面提示。" },
    ],
  },
  {
    no: 12,
    title: "完整專題：打擊病毒",
    range: "第 12 堂",
    badge: "打擊病毒創作者",
    color: "coral",
    objective: "整合前面技巧，完成一個可玩的射擊遊戲作品。",
    overview: "本章是課程專題整合，學生會把主角控制、敵人、發射、碰撞、計分、計時與勝負判斷組合成一個完整作品。完成後，作品應能被同學完整試玩。",
    lessonPoints: ["整理開始、遊玩與結束流程。", "整合控制、攻擊、敵人、分數與勝負。", "完成試玩、修正並準備上傳作品。"],
    videoStartIndex: 13,
    videoTitles: ["畫面切換(遊戲選單或關卡製作)", "課程檢核表"],
    checks: [
      { id: "complete-game", label: "我的作品有開始、遊玩與結束流程。" },
      { id: "core-systems", label: "我整合了控制、敵人、攻擊、計分與勝負條件。" },
      { id: "playtest", label: "我請自己或同學完整試玩過一次並修正問題。" },
    ],
  },
];
