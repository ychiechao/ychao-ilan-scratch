import { strFromU8, unzipSync } from "fflate";

type ScratchInput = unknown[];

type ScratchBlock = {
  opcode: string;
  next: string | null;
  inputs: Record<string, ScratchInput>;
  fields: Record<string, unknown[]>;
  topLevel?: boolean;
};

type ScratchTarget = {
  isStage: boolean;
  x?: number;
  y?: number;
  direction?: number;
  blocks: Record<string, ScratchBlock>;
};

type ScratchProject = {
  targets?: ScratchTarget[];
};

export type ScratchCheckResult = {
  id: string;
  passed: boolean;
  detail: string;
};

export type ScratchAnalysis = {
  passedIds: string[];
  checks: ScratchCheckResult[];
};

type MotionState = {
  x: number;
  y: number;
  direction: number;
  points: Array<{ x: number; y: number }>;
  usedRepeatForward: boolean;
  hasInitialPosition: boolean;
};

const STAGE_X = 240;
const STAGE_Y = 180;
const MAX_PROJECT_JSON = 10 * 1024 * 1024;

export async function analyzeScratchFile(file: File, chapterNo: number): Promise<ScratchAnalysis> {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (entry) => entry.name === "project.json",
    });
  } catch {
    throw new Error("無法讀取這個 Scratch 檔案，請在 Scratch 中重新下載後再試一次。");
  }

  const projectBytes = archive["project.json"];
  if (!projectBytes || projectBytes.length > MAX_PROJECT_JSON) {
    throw new Error("檔案內找不到有效的 Scratch 專案資料。");
  }

  let project: ScratchProject;
  try {
    project = JSON.parse(strFromU8(projectBytes)) as ScratchProject;
  } catch {
    throw new Error("Scratch 專案資料不完整，請重新下載作品。");
  }

  const sprites = (project.targets ?? []).filter((target) => !target.isStage && target.blocks);
  if (sprites.length === 0) {
    throw new Error("作品中找不到可檢核的角色。");
  }

  if (chapterNo === 1) {
    return result([{ id: "save-project", passed: true, detail: "已成功讀取 Scratch .sb3 作品。" }]);
  }
  if (chapterNo === 2) return analyzeChapterTwo(sprites);
  if (chapterNo === 3) return analyzeChapterThree(sprites);

  return result([]);
}

function analyzeChapterTwo(sprites: ScratchTarget[]): ScratchAnalysis {
  let best: MotionState | null = null;

  for (const sprite of sprites) {
    for (const block of Object.values(sprite.blocks)) {
      if (block.opcode !== "event_whenflagclicked") continue;
      const state: MotionState = {
        x: finite(sprite.x, 0),
        y: finite(sprite.y, 0),
        direction: finite(sprite.direction, 90),
        points: [],
        usedRepeatForward: false,
        hasInitialPosition: false,
      };
      state.points.push({ x: state.x, y: state.y });
      runChain(block.next, sprite.blocks, state, false, 0);
      if (!best || motionQuality(state) > motionQuality(best)) best = state;
    }
  }

  const state = best;
  const initial = Boolean(state?.hasInitialPosition);
  const repeatForward = Boolean(state?.usedRepeatForward);
  const loop = Boolean(state && isClosedStageLoop(state.points));

  return result([
    {
      id: "green-flag",
      passed: initial,
      detail: initial ? "綠旗開始後有設定角色的初始位置。" : "請在綠旗程式中先設定角色的初始位置。",
    },
    {
      id: "move-block",
      passed: repeatForward && loop,
      detail: repeatForward && loop
        ? "已使用重複與前進積木，並回到起點附近。"
        : "請用重複與前進積木走出四邊，最後回到起點附近。",
    },
    {
      id: "debug-move",
      passed: loop && Boolean(state && staysOnStage(state.points)),
      detail: loop && state && staysOnStage(state.points)
        ? "模擬移動路線都在 Scratch 舞台範圍內。"
        : "移動路線需繞一圈，且每一步都不能超出舞台。",
    },
  ]);
}

function analyzeChapterThree(sprites: ScratchTarget[]): ScratchAnalysis {
  let best: { initial: boolean; glides: ScratchBlock[]; blocks: Record<string, ScratchBlock>; start: { x: number; y: number } } | null = null;

  for (const sprite of sprites) {
    for (const block of Object.values(sprite.blocks)) {
      if (block.opcode !== "event_whenflagclicked") continue;
      const chain = chainBlocks(block.next, sprite.blocks);
      const startBlock = chain.find((item) => item.opcode === "motion_gotoxy");
      const start = startBlock
        ? { x: numberInput(startBlock.inputs.X, sprite.blocks, finite(sprite.x, 0)), y: numberInput(startBlock.inputs.Y, sprite.blocks, finite(sprite.y, 0)) }
        : { x: finite(sprite.x, 0), y: finite(sprite.y, 0) };
      const candidate = {
        initial: Boolean(startBlock),
        glides: chain.filter((item) => item.opcode === "motion_glidesecstoxy"),
        blocks: sprite.blocks,
        start,
      };
      if (!best || candidate.glides.length > best.glides.length) best = candidate;
    }
  }

  const glides = best?.glides ?? [];
  const destinations = glides.map((block) => ({
    x: numberInput(block.inputs.X, best?.blocks ?? {}, Number.NaN),
    y: numberInput(block.inputs.Y, best?.blocks ?? {}, Number.NaN),
  }));
  const allCoordinatesValid = destinations.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const path = best ? [best.start, ...destinations] : [];
  const glideLoop = glides.length >= 4 && allCoordinatesValid && isClosedStageLoop(path) && staysOnStage(path);
  const randomDuration = glides.length >= 4 && glides.every((block) => isRandomInput(block.inputs.SECS, best?.blocks ?? {}));

  return result([
    {
      id: "xy",
      passed: Boolean(best?.initial),
      detail: best?.initial ? "綠旗開始後有設定角色的初始座標。" : "請先用定位積木設定角色的初始座標。",
    },
    {
      id: "glide",
      passed: glideLoop,
      detail: glideLoop
        ? "已用四段以上的滑行繞舞台一圈，並回到起點附近。"
        : "請用至少四段滑行移動到舞台四周，最後回到起點附近。",
    },
    {
      id: "repeat-test",
      passed: randomDuration,
      detail: randomDuration
        ? "每一段滑行時間都使用隨機取數。"
        : "每一段滑行的秒數都要放入隨機取數積木。",
    },
  ]);
}

function runChain(
  startId: string | null,
  blocks: Record<string, ScratchBlock>,
  state: MotionState,
  insideRepeat: boolean,
  depth: number,
) {
  if (!startId || depth > 12) return;
  let id: string | null = startId;
  let guard = 0;

  while (id && guard < 500) {
    const block: ScratchBlock | undefined = blocks[id];
    if (!block) break;

    if (block.opcode === "motion_gotoxy") {
      state.x = numberInput(block.inputs.X, blocks, state.x);
      state.y = numberInput(block.inputs.Y, blocks, state.y);
      if (!state.hasInitialPosition) state.points = [];
      state.hasInitialPosition = true;
      pushPoint(state);
    } else if (block.opcode === "motion_pointindirection") {
      state.direction = numberInput(block.inputs.DIRECTION, blocks, state.direction);
    } else if (block.opcode === "motion_movesteps") {
      const steps = numberInput(block.inputs.STEPS, blocks, 0);
      const radians = state.direction * Math.PI / 180;
      state.x += Math.sin(radians) * steps;
      state.y += Math.cos(radians) * steps;
      if (insideRepeat && Math.abs(steps) > 0) state.usedRepeatForward = true;
      pushPoint(state);
    } else if (block.opcode === "motion_turnright") {
      state.direction += numberInput(block.inputs.DEGREES, blocks, 0);
    } else if (block.opcode === "motion_turnleft") {
      state.direction -= numberInput(block.inputs.DEGREES, blocks, 0);
    } else if (block.opcode === "control_repeat") {
      const count = Math.min(200, Math.max(0, Math.round(numberInput(block.inputs.TIMES, blocks, 0))));
      const substack = blockReference(block.inputs.SUBSTACK, blocks);
      for (let iteration = 0; iteration < count; iteration += 1) {
        runChain(substack, blocks, state, true, depth + 1);
      }
    }

    id = block.next;
    guard += 1;
  }
}

function chainBlocks(startId: string | null, blocks: Record<string, ScratchBlock>) {
  const found: ScratchBlock[] = [];
  let id = startId;
  let guard = 0;
  while (id && guard < 500) {
    const block: ScratchBlock | undefined = blocks[id];
    if (!block) break;
    found.push(block);
    id = block.next;
    guard += 1;
  }
  return found;
}

function numberInput(input: ScratchInput | undefined, blocks: Record<string, ScratchBlock>, fallback: number) {
  if (!Array.isArray(input)) return fallback;
  const value = input[1];
  if (Array.isArray(value)) {
    const number = Number(value[1]);
    return Number.isFinite(number) ? number : fallback;
  }
  if (typeof value === "string" && blocks[value]?.opcode === "operator_random") {
    const from = numberInput(blocks[value].inputs.FROM, blocks, fallback);
    const to = numberInput(blocks[value].inputs.TO, blocks, fallback);
    return (from + to) / 2;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function blockReference(input: ScratchInput | undefined, blocks: Record<string, ScratchBlock>) {
  if (!Array.isArray(input)) return null;
  const value = input[1];
  return typeof value === "string" && blocks[value] ? value : null;
}

function isRandomInput(input: ScratchInput | undefined, blocks: Record<string, ScratchBlock>) {
  const id = blockReference(input, blocks);
  if (!id || blocks[id].opcode !== "operator_random") return false;
  const from = numberInput(blocks[id].inputs.FROM, blocks, Number.NaN);
  const to = numberInput(blocks[id].inputs.TO, blocks, Number.NaN);
  return Number.isFinite(from) && Number.isFinite(to) && from !== to;
}

function isClosedStageLoop(points: Array<{ x: number; y: number }>) {
  if (points.length < 5) return false;
  const first = points[0];
  const last = points[points.length - 1];
  const distance = Math.hypot(last.x - first.x, last.y - first.y);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return distance <= 35 && Math.max(...xs) - Math.min(...xs) >= 100 && Math.max(...ys) - Math.min(...ys) >= 100;
}

function staysOnStage(points: Array<{ x: number; y: number }>) {
  return points.length > 0 && points.every((point) => (
    Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= -STAGE_X && point.x <= STAGE_X && point.y >= -STAGE_Y && point.y <= STAGE_Y
  ));
}

function motionQuality(state: MotionState) {
  return state.points.length + (state.hasInitialPosition ? 1000 : 0) + (state.usedRepeatForward ? 1000 : 0);
}

function pushPoint(state: MotionState) {
  state.points.push({ x: state.x, y: state.y });
}

function finite(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function result(checks: ScratchCheckResult[]): ScratchAnalysis {
  return { checks, passedIds: checks.filter((check) => check.passed).map((check) => check.id) };
}
