# 宜蘭 Scratch 基礎課程

Scratch 課程設計與學習平台。除了既有 12 堂自學課程，也包含公開課程庫、教師課程設計室、參考作品分析、版本送審與班級採用。

## 功能

- 老師、學生與超級管理者都使用 Firebase Authentication 的 Google 帳號登入。
- 超級管理者啟用或停用教師帳號，並審核新班級。
- 老師建立班級並產生班級代碼，啟用後才對學生開放。
- 教師可新增、編輯或剔除自己班級的學生。
- 學生用班級代碼、座號、暱稱與 Google 帳號加入。
- 每章在學生裝置上檢查 Scratch `.sb3` 檔案並勾選自我檢核。
- 老師可為班級設定 Google 表單或其他雲端收件連結。
- 學生回報完成繳交後，由老師確認並發放徽章。
- 完成本章檢核後取得徽章。
- 老師後台查看全班章節狀態與徽章數。
- 教師建立「課程 → 課堂 → 題目」，為每題上傳一份參考 `.sb3`。
- 系統從參考作品產生確定性的檢核建議，教師可調整配分、必要性及人工檢核。
- 課程經管理員審核後進入公開課程庫，班級採用時鎖定版本。
- 課程可匯出及匯入包含題目、規則和參考作品的 ZIP。
- 學生作品只在瀏覽器分析，平台不保存學生 `.sb3` 原始檔。

## 技術

- Vinext / React
- Firebase Authentication：Google 登入
- Cloudflare D1：老師、班級、學生、進度、徽章資料
- Cloudflare Workers KV：私人保存教師參考 `.sb3`（免費方案、不需信用卡）
- 老師自選雲端空間：學生 `.sb3` 原始檔（不經過本網站）
- Drizzle migrations：`drizzle/0000_crazy_naoko.sql` 至 `drizzle/0006_google_drive_storage.sql`

## 指令

```bash
npm install
npm run dev
npm run build
npm test
```

## Cloudflare 資源

正式環境需要 D1 `yilan-scratch-db` 與 Workers KV `yilan-scratch-reference-files`。參考作品不公開，下載前一律由網站 API 檢查教師、管理員或採用課程班級的權限。單一 `.sb3` 上限為 20 MB；學生作品仍只在瀏覽器分析。

```bash
npx wrangler d1 migrations apply yilan-scratch-db --remote
npx wrangler kv namespace create yilan-scratch-reference-files
npx wrangler types
npx wrangler secret put REFERENCE_STORAGE_SECRET
```

`REFERENCE_STORAGE_SECRET` 至少 32 個字元，用於讓 Sites 網址安全呼叫同一個 Workers KV 儲存服務。正式檔案只存在 KV；儲存鍵、檔名、大小、SHA-256 與擁有者索引保存在 D1。歷史 migration `0006_google_drive_storage.sql` 為舊版相容資料，不再需要設定 Google Drive、服務帳戶或 JSON 金鑰。

主要入口：

- `/studio`：教師課程設計室
- `/library`：公開課程庫
- `/learn`：學生的班級課程
- `/admin/courses`：管理員課程審核
- `/admin/storage`：超管查看 Cloudflare 檔案儲存狀態

## Firebase Authentication 設定

本專案使用 Firebase 專案 `ychao-booking-schedule`（已寫入 `.firebaserc`）。

1. 在 `ychao-booking-schedule` 的 Firebase Console「Authentication → Sign-in method」啟用「Google」。
2. 在「Authentication → 設定 → 已授權的網域」加入 `yilan-scratch-course.ychao-ilc.workers.dev`。
3. 到「專案設定 → 一般設定 → 您的應用程式」取得 Web API Key。
4. 本機建立 `.dev.vars`：

```dotenv
FIREBASE_PROJECT_ID=ychao-booking-schedule
FIREBASE_WEB_API_KEY=你的_Firebase_Web_API_Key
```

5. 部署到 Cloudflare 前設定 Worker secret：

```bash
npx wrangler secret put FIREBASE_WEB_API_KEY
```

既有 D1 老師或學生只要資料中的 Email 與 Google 帳號相同，就能保留原本的班級與學習進度。
