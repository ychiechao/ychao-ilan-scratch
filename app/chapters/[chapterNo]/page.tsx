import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { chapters, playlistEmbedUrl, playlistUrl } from "../../course-data";

type ChapterPageProps = {
  params: {
    chapterNo: string;
  };
};

function findChapter(chapterNo: string) {
  const no = Number(chapterNo);
  return chapters.find((chapter) => chapter.no === no);
}

async function absoluteUrl(path: string) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}${path}`;
}

export function generateStaticParams() {
  return chapters.map((chapter) => ({
    chapterNo: String(chapter.no),
  }));
}

export async function generateMetadata({ params }: ChapterPageProps): Promise<Metadata> {
  const chapter = findChapter(params.chapterNo);
  const title = chapter
    ? `${chapter.range} ${chapter.title} | 宜蘭 Scratch 基礎課程`
    : "找不到章節 | 宜蘭 Scratch 基礎課程";
  const description = chapter?.objective ?? "這個章節不存在，請回到課程地圖選擇章節。";
  const url = await absoluteUrl(`/chapters/${chapter?.no ?? params.chapterNo}`);

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      type: "article",
      url,
      images: [],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [],
    },
  };
}

export default function ChapterPage({ params }: ChapterPageProps) {
  const chapter = findChapter(params.chapterNo);

  if (!chapter) {
    return (
      <main className="lesson-page">
        <section className="lesson-empty">
          <Link className="back-link" href="/?mode=map">
            回課程地圖
          </Link>
          <h1>找不到這個章節</h1>
          <p>請回到課程地圖，選擇 1 到 12 的章節頁面。</p>
        </section>
      </main>
    );
  }

  const previous = chapters.find((item) => item.no === chapter.no - 1);
  const next = chapters.find((item) => item.no === chapter.no + 1);
  const studentCheckUrl = `/?mode=student&chapter=${chapter.no}#student-entry`;

  return (
    <main className="lesson-page">
      <section className={`lesson-hero lesson-hero--${chapter.color}`}>
        <div>
          <Link className="back-link" href="/?mode=map">
            回課程地圖
          </Link>
          <p className="eyebrow">{chapter.range}</p>
          <h1>{chapter.title}</h1>
          <p>{chapter.objective}</p>
          <div className="lesson-hero__actions">
            <Link href={studentCheckUrl}>前往上傳檢核</Link>
            <a href={playlistUrl} target="_blank" rel="noreferrer">
              開啟播放清單
            </a>
          </div>
        </div>
        <div className="lesson-badge">
          <span>完成徽章</span>
          <strong>{chapter.badge}</strong>
        </div>
      </section>

      <div className="lesson-layout">
        <nav className="lesson-nav" aria-label="章節導覽">
          <span>12 堂章節</span>
          {chapters.map((item) => (
            <Link
              key={item.no}
              className={item.no === chapter.no ? "selected" : ""}
              href={`/chapters/${item.no}`}
            >
              <b>{String(item.no).padStart(2, "0")}</b>
              {item.title}
            </Link>
          ))}
        </nav>

        <article className="lesson-content">
          <section className="lesson-section" aria-labelledby="goals">
            <div className="lesson-section__head">
              <span>01</span>
              <h2 id="goals">學習目標</h2>
            </div>
            <p>{chapter.objective}</p>
            <ul className="lesson-points">
              {chapter.lessonPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <section className="lesson-section" aria-labelledby="overview">
            <div className="lesson-section__head">
              <span>02</span>
              <h2 id="overview">內容說明</h2>
            </div>
            <p>{chapter.overview}</p>
            <div className="lesson-video-list">
              {chapter.videoTitles.map((title) => (
                <span key={title}>{title}</span>
              ))}
            </div>
          </section>

          <section className="lesson-section" aria-labelledby="video">
            <div className="lesson-section__head">
              <span>03</span>
              <h2 id="video">章節影片</h2>
            </div>
            <div className="video-frame">
              <iframe
                title={`${chapter.range} ${chapter.title}影片`}
                src={playlistEmbedUrl(chapter.videoStartIndex)}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </section>

          <section className="lesson-section" aria-labelledby="self-check">
            <div className="lesson-section__head">
              <span>04</span>
              <h2 id="self-check">自我檢核</h2>
            </div>
            <div className="lesson-checks">
              {chapter.checks.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <p className="lesson-submit-hint">
              完成檢核後，上傳 .sb3 作品檔。通過後會取得「{chapter.badge}」。
            </p>
            <Link className="lesson-submit-link" href={studentCheckUrl}>
              到學生入口上傳作品
            </Link>
          </section>

          <footer className="lesson-footer">
            {previous ? <Link href={`/chapters/${previous.no}`}>上一章：{previous.title}</Link> : <span />}
            {next ? <Link href={`/chapters/${next.no}`}>下一章：{next.title}</Link> : <span />}
          </footer>
        </article>
      </div>
    </main>
  );
}
