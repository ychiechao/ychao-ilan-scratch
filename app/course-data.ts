export type Chapter = {
  no: number;
  title: string;
  range: string;
  badge: string;
  color: string;
  objective: string;
  videoTitles: string[];
  checks: { id: string; label: string }[];
};

export const playlistUrl =
  "https://www.youtube.com/playlist?list=PLZPSeHCk8Xgz9XLsonQTJHyqp-9Zj1v7R";

export const chapters: Chapter[] = [
  {
    no: 1,
    title: "Scratch 基本環境",
    range: "第 1 堂",
    badge: "Scratch 探險家",
    color: "green",
    objective: "認識 Scratch 介面，能建立角色並開始用積木描述動作。",
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
    videoTitles: ["畫面切換(遊戲選單或關卡製作)", "課程檢核表"],
    checks: [
      { id: "complete-game", label: "我的作品有開始、遊玩與結束流程。" },
      { id: "core-systems", label: "我整合了控制、敵人、攻擊、計分與勝負條件。" },
      { id: "playtest", label: "我請自己或同學完整試玩過一次並修正問題。" },
    ],
  },
];
