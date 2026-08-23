# 宜蘭 Scratch 基礎課程

12 堂 Scratch 自學課程網站第一版，包含老師開班、學生加入班級、章節自我檢核、`.sb3` 上傳、徽章與老師後台進度表。

## 功能

- 老師用 Email 與 PIN 註冊/登入。
- 老師建立班級並產生班級代碼。
- 學生用班級代碼、座號、暱稱與 PIN 加入。
- 每章在學生裝置上檢查 Scratch `.sb3` 檔案並勾選自我檢核。
- 老師可為班級設定 Google 表單或其他雲端收件連結。
- 學生回報完成繳交後，由老師確認並發放徽章。
- 完成本章檢核後取得徽章。
- 老師後台查看全班章節狀態與徽章數。

## 技術

- Vinext / React
- Cloudflare D1：老師、班級、學生、進度、徽章資料
- 老師自選雲端空間：學生 `.sb3` 原始檔（不經過本網站）
- Drizzle migration：`drizzle/0000_crazy_naoko.sql`

## 指令

```bash
npm install
npm run dev
npm run build
npm test
```
