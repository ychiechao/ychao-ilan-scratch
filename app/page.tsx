import type { Metadata } from "next";
import { CourseApp, type AppMode } from "./CourseApp";

export const metadata: Metadata = {
  title: "Scratch 公開課程庫｜宜蘭 Scratch",
  description: "瀏覽宜蘭 Scratch 公開課程，查看章節、學習目標與自我檢核內容。",
};

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const modes = new Set<AppMode>(["library", "student", "account", "teacher", "admin", "map", "chapter"]);

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const mode = typeof params.mode === "string" ? params.mode : "";
  const initialMode = modes.has(mode as AppMode) ? mode as AppMode : "library";
  return <CourseApp initialModeValue={initialMode} />;
}
