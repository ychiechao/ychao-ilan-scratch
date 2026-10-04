export const ILC_SCRATCH_HOME = "https://s3.ilc.edu.tw/";
export const ILC_SCRATCH_LABEL = "宜蘭 Scratch 作品";

export function isIlcScratchPlatform(value: string) {
  try {
    return new URL(value).hostname.toLowerCase() === "s3.ilc.edu.tw";
  } catch {
    return false;
  }
}

export function normalizeIlcScratchProjectUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "s3.ilc.edu.tw") {
      return null;
    }

    const match = parsed.pathname.match(/^\/projects\/(\d+)\/?$/);
    if (!match) return null;
    return `https://s3.ilc.edu.tw/projects/${match[1]}/`;
  } catch {
    return null;
  }
}
