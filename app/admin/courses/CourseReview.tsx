"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { authorizedFetch, firebaseAuth, signInWithGoogle } from "../../firebase-client";

type Review = { version_id: string; version_no: number; course_id: string; title: string; summary: string; owner_name: string; owner_email: string; lesson_count: number; question_count: number };
type ReviewCourse = { title: string; summary: string; ownerName: string; version: { id: string; versionNo: number }; lessons: Array<{ id: string; title: string; objective: string; questions: Array<{ id: string; title: string; prompt: string; referenceAssetId?: string | null; referenceFileName?: string | null; rules: Array<{ id: string; label: string; mode: string; weight: number }> }> }> };

async function json<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || "操作失敗。");
  return data as T;
}

export function CourseReview() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selected, setSelected] = useState<ReviewCourse | null>(null);
  const [message, setMessage] = useState("請使用超級管理者帳號登入。");
  async function load() {
    const data = await json<{ reviews: Review[] }>(await authorizedFetch("/api/admin/course-reviews"));
    setReviews(data.reviews);
    setMessage(`目前有 ${data.reviews.length} 門課程待審。`);
  }
  useEffect(() => onAuthStateChanged(firebaseAuth, (user) => {
    if (user) void load().catch(() => undefined);
  }), []);
  async function login() {
    try { await signInWithGoogle(); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "登入失敗。"); }
  }
  async function preview(versionId: string) {
    try {
      const data = await json<{ course: ReviewCourse }>(await authorizedFetch(`/api/admin/course-reviews?versionId=${encodeURIComponent(versionId)}`));
      setSelected(data.course);
    } catch (error) { setMessage(error instanceof Error ? error.message : "讀取失敗。"); }
  }
  async function review(versionId: string, action: "approve" | "reject") {
    const comment = action === "reject" ? window.prompt("請輸入退回修改原因：") : window.prompt("審核備註（可留空）：", "");
    if (action === "reject" && !comment) return;
    try {
      await json(await authorizedFetch("/api/admin/course-reviews", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId, action, comment }) }));
      setSelected(null);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "審核失敗。"); }
  }
  async function downloadReference(assetId: string, fileName: string) {
    const response = await authorizedFetch(`/api/course-files?assetId=${encodeURIComponent(assetId)}`);
    if (!response.ok) { setMessage("無法下載參考作品。"); return; }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url);
  }
  return <main className="review-shell">
    <header><div><a href="/">← 回首頁</a><p className="eyebrow">Administration</p><h1>公開課程審核</h1></div><button onClick={login}>超管 Google 登入</button></header>
    <div className="studio-message">{message}</div>
    <section>
      {reviews.map((item) => <article className="review-card" key={item.version_id}><div><span>v{item.version_no} · {item.lesson_count} 堂 · {item.question_count} 題</span><h2>{item.title}</h2><p>{item.summary}</p><small>{item.owner_name} · {item.owner_email}</small></div><div><button onClick={() => void preview(item.version_id)}>完整預覽</button><button onClick={() => void review(item.version_id, "approve")}>通過發布</button><button className="danger" onClick={() => void review(item.version_id, "reject")}>退回修改</button></div></article>)}
      {selected && <article className="studio-card review-preview"><button className="ghost" onClick={() => setSelected(null)}>關閉預覽</button><p className="eyebrow">v{selected.version.versionNo} · {selected.ownerName}</p><h2>{selected.title}</h2><p>{selected.summary}</p>{selected.lessons.map((lesson, index) => <section key={lesson.id}><h3>{index + 1}. {lesson.title}</h3><p>{lesson.objective}</p>{lesson.questions.map((question) => <div className="library-question" key={question.id}><strong>{question.title}</strong><p>{question.prompt}</p><small>{question.rules.length} 項規則 · {question.rules.reduce((sum, rule) => sum + rule.weight, 0)} 分</small>{question.referenceAssetId && <button onClick={() => void downloadReference(question.referenceAssetId!, question.referenceFileName || "reference.sb3")}>下載參考作品</button>}</div>)}</section>)}</article>}
    </section>
  </main>;
}
