import type { Metadata } from "next";
import { CourseApp } from "./CourseApp";

export const metadata: Metadata = {
  title: "宜蘭 Scratch 基礎課程",
  description: "老師開班並設定雲端收件連結，學生完成 .sb3 自我檢核與章節徽章。",
};

export default function Home() {
  return <CourseApp />;
}
