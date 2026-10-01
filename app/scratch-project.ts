import { strFromU8, unzipSync } from "fflate";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PROJECT_JSON = 10 * 1024 * 1024;

type ScratchBlock = {
  opcode?: string;
  next?: string | null;
  parent?: string | null;
  inputs?: Record<string, unknown[]>;
  fields?: Record<string, unknown[]>;
  topLevel?: boolean;
};

type ScratchTarget = {
  name?: string;
  isStage?: boolean;
  blocks?: Record<string, ScratchBlock>;
  costumes?: unknown[];
  sounds?: unknown[];
  variables?: Record<string, unknown[]>;
  broadcasts?: Record<string, string>;
};

type ScratchProject = { targets?: ScratchTarget[] };

export type ScratchScriptSummary = { event: string; opcodes: string[] };
export type ScratchTargetSummary = {
  name: string;
  isStage: boolean;
  blockCount: number;
  opcodes: string[];
  scripts: ScratchScriptSummary[];
};

export type ScratchProjectSummary = {
  schemaVersion: 1;
  valid: true;
  fileName: string;
  fileSize: number;
  sha256: string;
  targetCount: number;
  spriteCount: number;
  costumeCount: number;
  backdropCount: number;
  soundCount: number;
  blockCount: number;
  blockCounts: Record<string, number>;
  variables: string[];
  broadcasts: string[];
  extensions: string[];
  targets: ScratchTargetSummary[];
};

export type RubricMode = "automatic" | "manual" | "hybrid";
export type RubricScope = "project" | "stage" | "any_sprite" | `sprite:${string}`;
export type RubricRuleType =
  | "project_readable"
  | "minimum_sprite_count"
  | "opcode_exists"
  | "opcode_count"
  | "event_contains"
  | "variable_exists"
  | "broadcast_pair"
  | "all"
  | "any"
  | "not"
  | "manual_review";

export type RubricRule = {
  id: string;
  label: string;
  mode: RubricMode;
  scope: RubricScope;
  type: RubricRuleType;
  config: Record<string, unknown>;
  required: boolean;
  weight: number;
  passFeedback: string;
  failFeedback: string;
};

export type RubricResult = {
  ruleId: string;
  passed: boolean | null;
  score: number;
  detail: string;
};

export async function inspectScratchProject(file: File): Promise<ScratchProjectSummary> {
  if (!file.name.toLowerCase().endsWith(".sb3")) throw new Error("請選擇 Scratch .sb3 檔案。");
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) throw new Error("Scratch 檔案必須小於 20 MB。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("檔案不是有效的 Scratch 專案。");

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes, { filter: (entry) => entry.name === "project.json" && entry.originalSize <= MAX_PROJECT_JSON });
  } catch {
    throw new Error("無法解開 Scratch 專案，請重新下載作品。");
  }
  const projectBytes = archive["project.json"];
  if (!projectBytes || projectBytes.length > MAX_PROJECT_JSON) throw new Error("Scratch 專案缺少有效的 project.json。");

  let project: ScratchProject;
  try {
    project = JSON.parse(strFromU8(projectBytes)) as ScratchProject;
  } catch {
    throw new Error("Scratch 專案資料格式錯誤。");
  }

  const targets = (project.targets ?? []).filter((target) => target && target.blocks);
  if (!targets.some((target) => !target.isStage)) throw new Error("作品中找不到角色。");
  const blockCounts: Record<string, number> = {};
  const variables = new Set<string>();
  const broadcasts = new Set<string>();
  const extensions = new Set<string>();
  let costumeCount = 0;
  let backdropCount = 0;
  let soundCount = 0;

  const targetSummaries = targets.map((target, index): ScratchTargetSummary => {
    const blocks = target.blocks ?? {};
    const opcodes = Object.values(blocks).flatMap((block) => block.opcode ? [block.opcode] : []);
    opcodes.forEach((opcode) => {
      blockCounts[opcode] = (blockCounts[opcode] ?? 0) + 1;
      const extension = extensionName(opcode);
      if (extension) extensions.add(extension);
    });
    Object.values(target.variables ?? {}).forEach((value) => {
      if (typeof value?.[0] === "string") variables.add(value[0]);
    });
    Object.values(target.broadcasts ?? {}).forEach((value) => {
      if (typeof value === "string") broadcasts.add(value);
    });
    const costumes = target.costumes?.length ?? 0;
    if (target.isStage) backdropCount += costumes;
    else costumeCount += costumes;
    soundCount += target.sounds?.length ?? 0;

    const scripts = Object.entries(blocks)
      .filter(([, block]) => block.topLevel)
      .map(([id, block]) => ({
        event: block.opcode ?? "unknown",
        opcodes: collectScriptOpcodes(id, blocks),
      }));
    return {
      name: target.name || (target.isStage ? "舞台" : `角色 ${index + 1}`),
      isStage: Boolean(target.isStage),
      blockCount: opcodes.length,
      opcodes,
      scripts,
    };
  });

  return {
    schemaVersion: 1,
    valid: true,
    fileName: file.name,
    fileSize: file.size,
    sha256: await sha256Hex(bytes),
    targetCount: targets.length,
    spriteCount: targets.filter((target) => !target.isStage).length,
    costumeCount,
    backdropCount,
    soundCount,
    blockCount: Object.values(blockCounts).reduce((sum, count) => sum + count, 0),
    blockCounts,
    variables: [...variables].sort(),
    broadcasts: [...broadcasts].sort(),
    extensions: [...extensions].sort(),
    targets: targetSummaries,
  };
}

export function suggestRubricRules(summary: ScratchProjectSummary): RubricRule[] {
  const suggestions: Omit<RubricRule, "weight">[] = [
    rule("project", "作品可以正常開啟與分析", "project_readable", {}, "已成功讀取作品。", "請重新儲存有效的 Scratch 作品。"),
    rule("project", `作品至少有 ${summary.spriteCount} 個角色`, "minimum_sprite_count", { count: summary.spriteCount }, "角色數量符合要求。", "作品角色數量不足。"),
  ];

  const candidates: Array<[string, string, string]> = [
    ["event_whenflagclicked", "使用綠旗開始程式", "any_sprite"],
    ["control_forever", "使用重複無限次控制持續行為", "any_sprite"],
    ["control_repeat", "使用重複積木", "any_sprite"],
    ["control_if", "使用條件判斷", "any_sprite"],
    ["sensing_touchingobject", "使用碰撞偵測", "any_sprite"],
    ["control_create_clone_of", "建立角色分身", "any_sprite"],
    ["control_delete_this_clone", "完成後刪除分身", "any_sprite"],
    ["event_broadcast", "送出廣播訊息", "project"],
    ["data_setvariableto", "設定變數初始值", "project"],
    ["data_changevariableby", "依事件改變變數", "project"],
  ];
  for (const [opcode, label, scope] of candidates) {
    if (summary.blockCounts[opcode]) {
      suggestions.push(rule(scope as RubricScope, label, "opcode_exists", { opcode }, `已找到「${label}」的積木。`, `請加入能完成「${label}」的積木。`));
    }
  }
  if (summary.broadcasts.length > 0) {
    suggestions.push(rule("project", "廣播訊息有送出與接收", "broadcast_pair", {}, "廣播流程完整。", "請確認廣播訊息同時有送出與接收。"));
  }

  const selected = suggestions.slice(0, 10);
  const base = Math.floor(100 / selected.length);
  let remainder = 100 - base * selected.length;
  return selected.map((item) => ({ ...item, weight: base + (remainder-- > 0 ? 1 : 0) }));
}

export function evaluateRubric(summary: ScratchProjectSummary, rules: RubricRule[]) {
  const results = rules.map((rubric) => evaluateOne(summary, rubric));
  const automatic = results.filter((_, index) => rules[index].mode !== "manual");
  const score = automatic.reduce((sum, item) => sum + item.score, 0);
  const passed = rules.every((rubric, index) => !rubric.required || results[index].passed !== false);
  return { score, passed, results };
}

function evaluateOne(summary: ScratchProjectSummary, rubric: RubricRule): RubricResult {
  if (rubric.mode === "manual" || rubric.type === "manual_review") {
    return { ruleId: rubric.id, passed: null, score: 0, detail: "此項由教師人工確認。" };
  }
  const passed = evaluateCondition(summary, rubric.type, rubric.config, rubric.scope);
  return {
    ruleId: rubric.id,
    passed,
    score: passed ? rubric.weight : 0,
    detail: passed ? rubric.passFeedback : rubric.failFeedback,
  };
}

function evaluateCondition(summary: ScratchProjectSummary, type: RubricRuleType, config: Record<string, unknown>, scope: RubricScope): boolean {
  const targets = scopedTargets(summary, scope);
  if (type === "project_readable") return summary.valid;
  if (type === "minimum_sprite_count") return summary.spriteCount >= numeric(config.count, 1);
  if (type === "variable_exists") return config.name ? summary.variables.includes(String(config.name)) : summary.variables.length > 0;
  if (type === "broadcast_pair") {
    const sends = summary.blockCounts.event_broadcast ?? 0;
    const receives = summary.blockCounts.event_whenbroadcastreceived ?? 0;
    return sends > 0 && receives > 0;
  }
  if (type === "opcode_exists") return targets.some((target) => target.opcodes.includes(String(config.opcode ?? "")));
  if (type === "opcode_count") {
    const count = targets.reduce((sum, target) => sum + target.opcodes.filter((opcode) => opcode === config.opcode).length, 0);
    return count >= numeric(config.minimum, 1);
  }
  if (type === "event_contains") {
    const event = String(config.event ?? "");
    const contains = Array.isArray(config.contains) ? config.contains.map(String) : [];
    return targets.some((target) => target.scripts.some((script) => script.event === event && contains.every((opcode) => script.opcodes.includes(opcode))));
  }
  if (type === "all" || type === "any") {
    const children = Array.isArray(config.rules) ? config.rules : [];
    const values = children.map((child) => {
      const item = child as { type?: RubricRuleType; config?: Record<string, unknown>; scope?: RubricScope };
      return item.type ? evaluateCondition(summary, item.type, item.config ?? {}, item.scope ?? scope) : false;
    });
    return type === "all" ? values.every(Boolean) : values.some(Boolean);
  }
  if (type === "not") {
    const child = config.rule as { type?: RubricRuleType; config?: Record<string, unknown>; scope?: RubricScope } | undefined;
    return child?.type ? !evaluateCondition(summary, child.type, child.config ?? {}, child.scope ?? scope) : false;
  }
  return false;
}

function scopedTargets(summary: ScratchProjectSummary, scope: RubricScope) {
  if (scope === "project") return summary.targets;
  if (scope === "stage") return summary.targets.filter((target) => target.isStage);
  if (scope === "any_sprite") return summary.targets.filter((target) => !target.isStage);
  const name = scope.startsWith("sprite:") ? scope.slice(7) : "";
  return summary.targets.filter((target) => target.name === name);
}

function rule(scope: RubricScope, label: string, type: RubricRuleType, config: Record<string, unknown>, passFeedback: string, failFeedback: string): Omit<RubricRule, "weight"> {
  return { id: crypto.randomUUID(), label, mode: "automatic", scope, type, config, required: true, passFeedback, failFeedback };
}

function collectScriptOpcodes(startId: string, blocks: Record<string, ScratchBlock>) {
  const found: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string | null | undefined) => {
    if (!id || visited.has(id)) return;
    visited.add(id);
    const block = blocks[id];
    if (!block) return;
    if (block.opcode) found.push(block.opcode);
    Object.values(block.inputs ?? {}).forEach((input) => {
      for (const value of input) if (typeof value === "string" && blocks[value]) visit(value);
    });
    visit(block.next);
  };
  visit(startId);
  return found;
}

function extensionName(opcode: string) {
  const prefix = opcode.split("_")[0];
  return ["pen", "music", "videoSensing", "text2speech", "translate", "makeymakey", "microbit", "ev3", "wedo2", "boost", "gdxfor"].includes(prefix) ? prefix : "";
}

function numeric(value: unknown, fallback: number) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

async function sha256Hex(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hash = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
