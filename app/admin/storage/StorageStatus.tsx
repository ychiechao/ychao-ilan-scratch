"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { authorizedFetch, firebaseAuth, signInWithGoogle } from "../../firebase-client";

type StorageStatus = {
  configured: boolean;
  provider: string;
  mode: "direct" | "worker_service" | "unavailable";
  maxFileSizeMb: number;
};

async function json<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || "操作失敗。");
  return data as T;
}

export function StorageStatusPanel() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [message, setMessage] = useState("請使用超級管理者 Google 帳號登入。");
  const [signedIn, setSignedIn] = useState(false);

  async function load() {
    const data = await json<{ storage: StorageStatus }>(await authorizedFetch("/api/admin/reference-storage"));
    setStatus(data.storage);
    setSignedIn(true);
    setMessage(data.storage.configured
      ? "教師參考作品已由 Cloudflare KV 保存，不需要信用卡或 Google Drive 金鑰。"
      : "Cloudflare KV 尚未連線，請通知網站管理者。");
  }

  useEffect(() => onAuthStateChanged(firebaseAuth, (user) => {
    if (user) void load().catch((error) => setMessage(error instanceof Error ? error.message : "無法讀取儲存狀態。"));
  }), []);

  async function login() {
    try {
      await signInWithGoogle();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登入失敗。");
    }
  }

  return (
    <main className="drive-setup-shell">
      <header className="library-header">
        <div>
          <a href="/?mode=admin">← 回超管後台</a>
          <p className="eyebrow">File storage</p>
          <h1>Cloudflare 檔案儲存</h1>
          <p>教師參考作品由網站私密保存；學生作品仍只在學生裝置分析，不會上傳。</p>
        </div>
        {!signedIn && <button onClick={login}>超管 Google 登入</button>}
      </header>
      <div className="studio-message">{message}</div>

      {signedIn && status && (
        <section className="drive-status-card">
          <div><span>狀態</span><strong>{status.configured ? "已啟用" : "尚未啟用"}</strong></div>
          <div><span>儲存服務</span><strong>{status.provider}</strong></div>
          <div><span>單檔上限</span><strong>{status.maxFileSizeMb} MB</strong></div>
          <div><span>設定方式</span><strong>{status.mode === "direct" ? "Worker 直接連線" : status.mode === "worker_service" ? "網站安全連線" : "等待連線"}</strong></div>
          <a className="primary-link" href="/admin/courses">前往課程審核</a>
        </section>
      )}
    </main>
  );
}
