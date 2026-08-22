import type { Metadata } from "next";
import { CourseApp } from "./CourseApp";

export const metadata: Metadata = {
  title: "宜蘭 Scratch 基礎課程",
  description: "老師開班、學生上傳 .sb3 自我檢核，完成章節取得徽章。",
};

export default function Home() {
  return <CourseApp />;
}
