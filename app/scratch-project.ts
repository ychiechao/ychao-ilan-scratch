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
  const hasEvaluatedRule = results.some((item) => item.passed !== null);
  const passed = hasEvaluatedRule && rules.every((rubric, index) => !rubric.required || results[index].passed !== false);
  return { score, passed, results };
}

function evaluateOne(summary: ScratchProjectSummary, rubric: RubricRule): RubricResult {
  const legacyCheckId = typeof rubric.config.legacyCheckId === "string" ? rubric.config.legacyCheckId : "";
  if (legacyCheckId) {
    const passed = evaluateLegacyCheck(summary, legacyCheckId);
    return {
      ruleId: rubric.id,
      passed,
      score: passed ? rubric.weight : 0,
      detail: passed ? "這項學習目標已經達成。" : legacyCheckHint(legacyCheckId),
    };
  }
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

function evaluateLegacyCheck(summary: ScratchProjectSummary, checkId: string): boolean {
  const count = (opcode: string) => summary.blockCounts[opcode] ?? 0;
  const has = (opcode: string, minimum = 1) => count(opcode) >= minimum;
  const hasMovement = has("motion_changexby") || has("motion_changeyby") || has("motion_movesteps") || has("motion_glidesecstoxy");
  const customVariables = summary.variables.filter((name) => !/^my variable$/i.test(name.trim()));

  switch (checkId) {
    case "save-project": return summary.valid;
    case "green-flag": return has("event_whenflagclicked") && has("motion_gotoxy");
    case "move-block": return has("control_repeat") && has("motion_movesteps");
    case "debug-move": return has("motion_turnleft", 4) || has("motion_turnright", 4) || has("motion_ifonedgebounce");
    case "glide-start": return has("event_whenflagclicked") && has("motion_gotoxy");
    case "glide-loop": return has("motion_glidesecstoxy", 4);
    case "glide-random": return has("motion_glidesecstoxy", 4) && has("operator_random", 4);
    case "coordinate-start": return has("event_whenflagclicked") && has("motion_gotoxy");
    case "coordinate-motion": return has("control_repeat", 4) && has("motion_changexby", 2) && has("motion_changeyby", 2);
    case "coordinate-boundary": return has("motion_changexby", 2) && has("motion_changeyby", 2);
    case "controller-start": return has("event_whenflagclicked") && has("motion_gotoxy");
    case "controller-keys": return has("control_forever") && has("sensing_keypressed", 4) && has("control_if", 4);
    case "controller-motion": return has("motion_changexby", 2) && has("motion_changeyby", 2);
    case "supporting-sprite": return summary.spriteCount >= 2;
    case "supporting-loop": return summary.targets.some((target) => !target.isStage
      && target.scripts.some((script) => script.event === "event_whenflagclicked"
        && script.opcodes.includes("motion_gotoxy")
        && script.opcodes.includes("control_forever")
        && script.opcodes.filter((opcode) => opcode === "motion_glidesecstoxy").length >= 2));
    case "supporting-random": return has("motion_glidesecstoxy", 2) && has("operator_random", 2);
    case "player-projectile": return summary.spriteCount >= 3 && has("event_whenflagclicked") && has("looks_hide");
    case "player-launch": return has("event_whenkeypressed") && has("motion_goto") && has("looks_show");
    case "player-flight": return has("control_repeat_until") && has("sensing_touchingobject", 2) && has("looks_hide", 2);
    case "enemy-projectile": return summary.spriteCount >= 4 && has("event_whenflagclicked", 2) && has("looks_hide", 2);
    case "enemy-launch": return has("motion_goto", 2) && has("looks_show", 2) && has("control_forever", 2);
    case "enemy-collision": return has("sensing_touchingobject", 4) && has("looks_hide", 4);
    case "clone-create": return has("control_forever") && has("control_wait") && has("operator_random") && has("control_create_clone_of");
    case "clone-action": return has("control_start_as_clone") && hasMovement && has("sensing_touchingobject");
    case "clone-delete": return has("control_delete_this_clone") && has("sensing_touchingobject");
    case "score-variable": return customVariables.length > 0;
    case "score-reset": return customVariables.length > 0 && has("data_setvariableto");
    case "score-change": return has("data_changevariableby") && has("sensing_touchingobject");
    case "broadcast-conditions": return customVariables.length >= 2 && has("operator_equals", 2);
    case "broadcast-messages": return summary.broadcasts.length >= 2 && has("event_broadcast", 2) && has("event_whenbroadcastreceived", 2);
    case "broadcast-results": return has("looks_show", 2) && has("control_stop", 2);
    case "direct-conditions": return customVariables.length >= 2 && has("operator_equals", 2);
    case "direct-wait": return has("control_wait_until", 2) && !has("event_broadcast");
    case "direct-results": return has("looks_show", 2) && has("control_stop", 2);
    case "timer-variable": return customVariables.some((name) => /時間|計時|timer|time/i.test(name)) && has("data_setvariableto");
    case "timer-countdown": return has("control_repeat_until") && has("control_wait") && has("data_changevariableby");
    case "timer-finish": return has("operator_equals") && has("control_stop");
    case "complete-game": return has("event_whenflagclicked", 3) && has("looks_show") && has("control_stop");
    case "core-systems": return summary.spriteCount >= 4 && has("sensing_keypressed") && has("sensing_touchingobject") && customVariables.length > 0;
    case "playtest": return summary.valid && summary.blockCount >= 20;
    default: return false;
  }
}

function legacyCheckHint(checkId: string): string {
  if (/start|green-flag|reset|variable/.test(checkId)) return "請檢查程式開始時，角色位置、方向或資料初始值是否已先設定完成。";
  if (/glide|move|motion|loop|boundary|supporting/.test(checkId)) return "請檢查移動流程是否完整，並確認每一段動作都放在正確的重複範圍內。";
  if (/random/.test(checkId)) return "請檢查隨機變化是否真的參與每一次動作，而不是只在開始時執行一次。";
  if (/key|controller/.test(checkId)) return "請檢查按鍵偵測與四個方向的動作是否都在持續執行的流程中。";
  if (/projectile|launch|flight|collision|enemy/.test(checkId)) return "請檢查發射前、飛行中與碰撞後三個階段是否都有對應處理。";
  if (/clone/.test(checkId)) return "請檢查分身的建立、開始行動與結束清除流程是否都有執行。";
  if (/score/.test(checkId)) return "請檢查記錄遊戲狀態的資料是否會先重設，並在事件發生後正確改變。";
  if (/broadcast/.test(checkId)) return "請檢查勝負訊息是否有完整的送出、接收與畫面回應流程。";
  if (/direct|result/.test(checkId)) return "請檢查勝負條件成立後，結果畫面與停止遊戲的流程是否完整。";
  if (/timer/.test(checkId)) return "請檢查時間資料的初始值、倒數過程與歸零後的處理是否連接完整。";
  if (/complete-game|core-systems|playtest/.test(checkId)) return "請從開始、遊玩到結束逐段測試，找出尚未連接完整的遊戲流程。";
  return "這項目標尚未完整偵測到，請回到章節說明重新測試相關功能。";
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
