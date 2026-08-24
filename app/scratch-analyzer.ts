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
  coordinateAxes: Set<"x" | "y">;
  hasInitialPosition: boolean;
};

export type ScratchTask = "default" | "glide" | "coordinates" | "broadcast" | "direct";

const STAGE_X = 240;
const STAGE_Y = 180;
const MAX_PROJECT_JSON = 10 * 1024 * 1024;

export async function analyzeScratchFile(
  file: File,
  chapterNo: number,
  task: ScratchTask = "default",
): Promise<ScratchAnalysis> {
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

  const targets = (project.targets ?? []).filter((target) => target.blocks);
  const sprites = targets.filter((target) => !target.isStage);
  if (sprites.length === 0) {
    throw new Error("作品中找不到可檢核的角色。");
  }

  if (chapterNo === 1) {
    return result([{ id: "save-project", passed: true, detail: "已成功讀取 Scratch .sb3 作品。" }]);
  }
  if (chapterNo === 2) return analyzeChapterTwo(sprites);
  if (chapterNo === 3) {
    return task === "coordinates" ? analyzeChapterThreeCoordinates(sprites) : analyzeChapterThreeGlide(sprites);
  }
  if (chapterNo === 4) return analyzeChapterFour(sprites);
  if (chapterNo === 5) return analyzeChapterFive(sprites);
  if (chapterNo === 6) return analyzeChapterSix(targets);
  if (chapterNo === 7) return analyzeChapterSeven(targets);
  if (chapterNo === 8) return analyzeChapterEight(targets);
  if (chapterNo === 9) return analyzeChapterNine(targets);
  if (chapterNo === 10) {
    return task === "direct" ? analyzeChapterTenDirect(targets) : analyzeChapterTenBroadcast(targets);
  }
  if (chapterNo === 11) return analyzeChapterEleven(targets);

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
        coordinateAxes: new Set(),
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

function analyzeChapterThreeGlide(sprites: ScratchTarget[]): ScratchAnalysis {
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
      id: "glide-start",
      passed: Boolean(best?.initial),
      detail: best?.initial ? "綠旗開始後有設定角色的初始座標。" : "請先用定位積木設定角色的初始座標。",
    },
    {
      id: "glide-loop",
      passed: glideLoop,
      detail: glideLoop
        ? "已用四段以上的滑行繞舞台一圈，並回到起點附近。"
        : "請用至少四段滑行移動到舞台四周，最後回到起點附近。",
    },
    {
      id: "glide-random",
      passed: randomDuration,
      detail: randomDuration
        ? "每一段滑行時間都使用隨機取數。"
        : "每一段滑行的秒數都要放入隨機取數積木。",
    },
  ]);
}

function analyzeChapterThreeCoordinates(sprites: ScratchTarget[]): ScratchAnalysis {
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
        coordinateAxes: new Set(),
        hasInitialPosition: false,
      };
      state.points.push({ x: state.x, y: state.y });
      runChain(block.next, sprite.blocks, state, false, 0);
      if (!best || coordinateQuality(state) > coordinateQuality(best)) best = state;
    }
  }

  const initial = Boolean(best?.hasInitialPosition);
  const usesBothAxes = Boolean(best?.coordinateAxes.has("x") && best.coordinateAxes.has("y"));
  const loop = Boolean(best && isClosedStageLoop(best.points));
  const inBounds = Boolean(best && loop && staysOnStage(best.points));

  return result([
    {
      id: "coordinate-start",
      passed: initial,
      detail: initial ? "綠旗開始後有設定角色的初始座標。" : "請先用定位積木設定角色的初始座標。",
    },
    {
      id: "coordinate-motion",
      passed: usesBothAxes && loop,
      detail: usesBothAxes && loop
        ? "已在重複積木中改變 X 與 Y 座標，並繞完一圈。"
        : "請在重複積木中分別改變 X 與 Y 座標，走完舞台四邊。",
    },
    {
      id: "coordinate-boundary",
      passed: inBounds,
      detail: inBounds
        ? "模擬座標路線都在舞台內，最後回到起點附近。"
        : "座標路線需保持在舞台內，最後回到起點附近。",
    },
  ]);
}

function analyzeChapterFour(sprites: ScratchTarget[]): ScratchAnalysis {
  let best: ScratchBlock[] = [];

  for (const sprite of sprites) {
    for (const block of Object.values(sprite.blocks)) {
      if (block.opcode !== "event_whenflagclicked") continue;
      const candidate = collectScriptBlocks(block.next, sprite.blocks);
      if (controllerQuality(candidate, sprites) > controllerQuality(best, sprites)) best = candidate;
    }
  }

  const opcodes = new Set(best.map((block) => block.opcode));
  const keys = new Set(
    best
      .filter((block) => block.opcode === "sensing_keypressed")
      .map((block) => keyName(block.inputs.KEY_OPTION, sprites))
      .filter(Boolean),
  );
  const xChanges = best.filter((block) => block.opcode === "motion_changexby")
    .map((block) => numberInputFromAnySprite(block.inputs.DX, sprites));
  const yChanges = best.filter((block) => block.opcode === "motion_changeyby")
    .map((block) => numberInputFromAnySprite(block.inputs.DY, sprites));
  const initialized = opcodes.has("motion_gotoxy") && opcodes.has("motion_pointindirection");
  const fourKeys = opcodes.has("control_forever") && ["right arrow", "left arrow", "up arrow", "down arrow"]
    .every((key) => keys.has(key));
  const fourDirections = xChanges.some((value) => value > 0) && xChanges.some((value) => value < 0)
    && yChanges.some((value) => value > 0) && yChanges.some((value) => value < 0);

  return result([
    {
      id: "controller-start",
      passed: initialized,
      detail: initialized
        ? "綠旗程式有設定主角的初始位置與方向。"
        : "請在綠旗程式中先設定主角的初始位置與方向。",
    },
    {
      id: "controller-keys",
      passed: fourKeys,
      detail: fourKeys
        ? "重複無限次會持續偵測四個方向鍵。"
        : "請在重複無限次中加入上、下、左、右四個方向鍵判斷。",
    },
    {
      id: "controller-motion",
      passed: fourDirections,
      detail: fourDirections
        ? "X 與 Y 座標都有正向及反向移動設定。"
        : "右／左鍵需增加／減少 X，上／下鍵需增加／減少 Y。",
    },
  ]);
}

function analyzeChapterFive(sprites: ScratchTarget[]): ScratchAnalysis {
  let best: { blocks: ScratchBlock[]; blockMap: Record<string, ScratchBlock> } | null = null;

  for (const sprite of sprites) {
    for (const block of Object.values(sprite.blocks)) {
      if (block.opcode !== "event_whenflagclicked") continue;
      const candidate = collectScriptBlocks(block.next, sprite.blocks);
      const currentGlides = candidate.filter((item) => item.opcode === "motion_glidesecstoxy").length;
      const bestGlides = best?.blocks.filter((item) => item.opcode === "motion_glidesecstoxy").length ?? -1;
      if (currentGlides > bestGlides) best = { blocks: candidate, blockMap: sprite.blocks };
    }
  }

  const blocks = best?.blocks ?? [];
  const opcodes = new Set(blocks.map((block) => block.opcode));
  const glides = blocks.filter((block) => block.opcode === "motion_glidesecstoxy");
  const destinations = glides.map((block) => ({
    x: numberInput(block.inputs.X, best?.blockMap ?? {}, Number.NaN),
    y: numberInput(block.inputs.Y, best?.blockMap ?? {}, Number.NaN),
  }));
  const distinctDestinations = new Set(destinations.map((point) => `${point.x},${point.y}`)).size;
  const hasSupportingSprite = sprites.length >= 2 && glides.length >= 2;
  const loopsMovement = opcodes.has("motion_gotoxy") && opcodes.has("control_forever")
    && glides.length >= 2 && distinctDestinations >= 2 && staysOnStage(destinations);
  const randomMovement = glides.length >= 2
    && glides.every((block) => isRandomInput(block.inputs.SECS, best?.blockMap ?? {}));

  return result([
    {
      id: "supporting-sprite",
      passed: hasSupportingSprite,
      detail: hasSupportingSprite
        ? "作品中有主角與另一個會滑行的配角。"
        : "請新增主角以外的配角，並替配角加入移動程式。",
    },
    {
      id: "supporting-loop",
      passed: loopsMovement,
      detail: loopsMovement
        ? "配角會先定位，再於重複無限次中來回滑行。"
        : "配角需先定位，並在重複無限次中滑行到至少兩個不同位置。",
    },
    {
      id: "supporting-random",
      passed: randomMovement,
      detail: randomMovement
        ? "配角的每一段滑行時間都使用隨機取數。"
        : "請把每一段滑行的秒數改成隨機取數。",
    },
  ]);
}

function analyzeChapterSix(targets: ScratchTarget[]): ScratchAnalysis {
  const projectile = targets.find((target) => Object.values(target.blocks).some((block) => (
    block.topLevel && block.opcode === "event_whenkeypressed" && fieldText(block, "KEY_OPTION") === "space"
  )));
  const keyScript = projectile
    ? topScript(projectile, "event_whenkeypressed", (block) => fieldText(block, "KEY_OPTION") === "space")
    : [];
  const flagScript = projectile ? topScript(projectile, "event_whenflagclicked") : [];
  const keyOpcodes = new Set(keyScript.map((block) => block.opcode));
  const projectileReady = Boolean(projectile && targets.filter((target) => !target.isStage).length >= 3
    && flagScript.some((block) => block.opcode === "looks_hide"));
  const launch = keyOpcodes.has("motion_goto") && keyOpcodes.has("looks_show");
  const flight = keyOpcodes.has("control_repeat_until") && keyOpcodes.has("motion_changexby")
    && keyScript.filter((block) => block.opcode === "sensing_touchingobject").length >= 2
    && keyOpcodes.has("looks_hide");

  return result([
    {
      id: "player-projectile",
      passed: projectileReady,
      detail: projectileReady ? "作品有獨立子彈角色，綠旗開始時會隱藏。" : "請建立獨立子彈角色，並在綠旗開始時隱藏。",
    },
    {
      id: "player-launch",
      passed: launch,
      detail: launch ? "按下空白鍵會讓子彈移到主角並顯示。" : "請用空白鍵觸發，讓子彈移到主角位置後顯示。",
    },
    {
      id: "player-flight",
      passed: flight,
      detail: flight ? "子彈會移動並偵測敵人與舞台邊緣。" : "請讓子彈移動到邊緣，並在碰到敵人或邊緣時隱藏。",
    },
  ]);
}

function analyzeChapterSeven(targets: ScratchTarget[]): ScratchAnalysis {
  let best: ScratchBlock[] = [];
  for (const target of targets.filter((item) => !item.isStage)) {
    const script = topScript(target, "event_whenflagclicked");
    const quality = ["control_forever", "motion_goto", "looks_show", "control_repeat_until", "motion_changexby"]
      .filter((opcode) => script.some((block) => block.opcode === opcode)).length;
    const bestQuality = ["control_forever", "motion_goto", "looks_show", "control_repeat_until", "motion_changexby"]
      .filter((opcode) => best.some((block) => block.opcode === opcode)).length;
    if (quality > bestQuality) best = script;
  }
  const opcodes = new Set(best.map((block) => block.opcode));
  const projectileReady = targets.filter((target) => !target.isStage).length >= 4
    && opcodes.has("looks_hide");
  const autoLaunch = opcodes.has("control_forever") && opcodes.has("motion_goto")
    && opcodes.has("looks_show") && opcodes.has("control_repeat_until") && opcodes.has("motion_changexby");
  const collision = best.filter((block) => block.opcode === "sensing_touchingobject").length >= 2
    && opcodes.has("looks_hide");

  return result([
    {
      id: "enemy-projectile",
      passed: projectileReady,
      detail: projectileReady ? "作品有獨立的配角子彈，開始時會隱藏。" : "請建立獨立的配角子彈，並在綠旗開始時隱藏。",
    },
    {
      id: "enemy-launch",
      passed: autoLaunch,
      detail: autoLaunch ? "配角子彈會重複定位、顯示並自動移動。" : "請在重複無限次中讓子彈移到配角、顯示並自動移動。",
    },
    {
      id: "enemy-collision",
      passed: collision,
      detail: collision ? "配角子彈會偵測主角與舞台邊緣。" : "請偵測子彈碰到主角或舞台邊緣，並將子彈隱藏。",
    },
  ]);
}

function analyzeChapterEight(targets: ScratchTarget[]): ScratchAnalysis {
  const blocks = targets.flatMap((target) => Object.values(target.blocks));
  const createTarget = targets.find((target) => Object.values(target.blocks)
    .some((block) => block.opcode === "control_create_clone_of"));
  const createScript = createTarget ? topScript(createTarget, "event_whenflagclicked") : [];
  const cloneScript = createTarget ? topScript(createTarget, "control_start_as_clone") : [];
  const createOpcodes = new Set(createScript.map((block) => block.opcode));
  const cloneOpcodes = new Set(cloneScript.map((block) => block.opcode));
  const randomWait = createTarget && createScript.some((block) => (
    block.opcode === "control_wait" && isRandomInput(block.inputs.DURATION, createTarget.blocks)
  ));
  const creates = Boolean(randomWait && createOpcodes.has("control_forever")
    && createOpcodes.has("control_create_clone_of"));
  const acts = cloneOpcodes.has("motion_goto") && cloneOpcodes.has("looks_show")
    && cloneOpcodes.has("control_repeat_until") && cloneOpcodes.has("motion_changexby")
    && cloneOpcodes.has("sensing_touchingobject");
  const deletes = blocks.filter((block) => block.opcode === "control_delete_this_clone").length >= 2;

  return result([
    {
      id: "clone-create",
      passed: creates,
      detail: creates ? "會在隨機等待後持續建立分身。" : "請在重複無限次中等待隨機時間，再建立分身。",
    },
    {
      id: "clone-action",
      passed: acts,
      detail: acts ? "分身開始後會顯示、移動並偵測碰撞。" : "請在分身建立後加入定位、顯示、移動與碰撞偵測。",
    },
    {
      id: "clone-delete",
      passed: deletes,
      detail: deletes ? "分身碰撞或到達邊緣後會刪除。" : "請在碰到主角與舞台邊緣時刪除分身。",
    },
  ]);
}

function analyzeChapterNine(targets: ScratchTarget[]): ScratchAnalysis {
  const blocks = targets.flatMap((target) => Object.values(target.blocks));
  const setBlocks = blocks.filter((block) => block.opcode === "data_setvariableto");
  const changeBlocks = blocks.filter((block) => block.opcode === "data_changevariableby");
  const initialized = setBlocks.find((block) => (
    fieldId(block, "VARIABLE") && numberInputFromTargets(block.inputs.VALUE, targets, 0) > 0
  ));
  const variableId = fieldId(initialized, "VARIABLE");
  const decreases = changeBlocks.some((block) => (
    fieldId(block, "VARIABLE") === variableId && numberInputFromTargets(block.inputs.VALUE, targets, 0) < 0
  ));
  const hasCollision = blocks.some((block) => block.opcode === "sensing_touchingobject");

  return result([
    {
      id: "score-variable",
      passed: Boolean(variableId),
      detail: variableId ? "作品有用來記錄敵人血量或分數的變數。" : "請建立敵人血量或計分類型的變數。",
    },
    {
      id: "score-reset",
      passed: Boolean(initialized),
      detail: initialized ? "綠旗開始後會設定變數的初始值。" : "請在綠旗開始時把變數設為大於零的初始值。",
    },
    {
      id: "score-change",
      passed: decreases && hasCollision,
      detail: decreases && hasCollision ? "碰撞後會減少同一個變數。" : "請在攻擊碰到敵人後減少同一個變數。",
    },
  ]);
}

function analyzeChapterTenBroadcast(targets: ScratchTarget[]): ScratchAnalysis {
  const blocks = targets.flatMap((target) => Object.values(target.blocks));
  const equalityVariables = new Set(blocks.filter((block) => block.opcode === "operator_equals")
    .flatMap((block) => Object.values(block.inputs).flatMap(variableIdsInInput)));
  const sends = blocks.filter((block) => block.opcode === "event_broadcast");
  const receives = blocks.filter((block) => block.opcode === "event_whenbroadcastreceived");
  const receivedMessages = new Set(receives.map((block) => fieldText(block, "BROADCAST_OPTION")).filter(Boolean));
  const completeResults = targets.flatMap((target) => Object.values(target.blocks)
    .filter((block) => block.topLevel && block.opcode === "event_whenbroadcastreceived")
    .map((block) => [block, ...collectScriptBlocks(block.next, target.blocks)]))
    .filter((script) => script.some((block) => block.opcode === "looks_show")
      && script.some((block) => block.opcode === "control_stop")).length;
  const conditions = equalityVariables.size >= 2
    && blocks.filter((block) => block.opcode === "data_changevariableby").length >= 2;
  const messages = sends.length >= 2 && receives.length >= 2 && receivedMessages.size >= 2;
  const results = completeResults >= 2;

  return result([
    { id: "broadcast-conditions", passed: conditions, detail: conditions ? "作品會分別判斷兩個生命值變數是否歸零。" : "請分別判斷主角與敵人的生命值是否等於零。" },
    { id: "broadcast-messages", passed: messages, detail: messages ? "作品具有兩種勝負廣播與對應接收程式。" : "請送出並接收 WIN／LOSE 兩種廣播。" },
    { id: "broadcast-results", passed: results, detail: results ? "勝利與失敗角色收到廣播後會顯示並停止遊戲。" : "WIN 與 LOSE 角色收到廣播後都需顯示，並停止全部程式。" },
  ]);
}

function analyzeChapterTenDirect(targets: ScratchTarget[]): ScratchAnalysis {
  const blocks = targets.flatMap((target) => Object.values(target.blocks));
  const hasBroadcasts = blocks.some((block) => block.opcode === "event_broadcast"
    || block.opcode === "event_whenbroadcastreceived");
  const resultScripts = targets.flatMap((target) => Object.values(target.blocks)
    .filter((block) => block.topLevel && block.opcode === "event_whenflagclicked")
    .map((block) => [block, ...collectScriptBlocks(block.next, target.blocks)]))
    .filter((script) => script.some((block) => block.opcode === "control_wait_until"));
  const equalityVariables = new Set(resultScripts.flatMap((script) => script
    .filter((block) => block.opcode === "operator_equals")
    .flatMap((block) => Object.values(block.inputs).flatMap(variableIdsInInput))));
  const completeResults = resultScripts.filter((script) => script.some((block) => block.opcode === "looks_hide")
    && script.some((block) => block.opcode === "looks_show")
    && script.some((block) => block.opcode === "control_stop")).length;
  const conditions = equalityVariables.size >= 2;
  const waitsDirectly = !hasBroadcasts && resultScripts.length >= 2;
  const results = completeResults >= 2;

  return result([
    { id: "direct-conditions", passed: conditions, detail: conditions ? "勝利與失敗程式分別檢查不同生命值。" : "請分別用主角與敵人生命值建立勝利及失敗條件。" },
    { id: "direct-wait", passed: waitsDirectly, detail: waitsDirectly ? "兩個結果程式使用等待直到條件，且沒有廣播。" : "請使用等待直到直接判斷勝負，並移除廣播積木。" },
    { id: "direct-results", passed: results, detail: results ? "條件成立後會顯示勝負畫面並停止遊戲。" : "勝利與失敗條件成立後都需顯示結果，並停止全部程式。" },
  ]);
}

function analyzeChapterEleven(targets: ScratchTarget[]): ScratchAnalysis {
  let best: { blocks: ScratchBlock[]; blockMap: Record<string, ScratchBlock> } | null = null;
  for (const target of targets) {
    for (const block of Object.values(target.blocks)) {
      if (!block.topLevel || block.opcode !== "event_whenflagclicked") continue;
      const candidate = [block, ...collectScriptBlocks(block.next, target.blocks)];
      if (timerQuality(candidate) > timerQuality(best?.blocks ?? [])) best = { blocks: candidate, blockMap: target.blocks };
    }
  }
  const blocks = best?.blocks ?? [];
  const blockMap = best?.blockMap ?? {};
  const initializedVariable = blocks.filter((block) => block.opcode === "data_setvariableto")
    .find((block) => numberInput(block.inputs.VALUE, blockMap, 0) > 0);
  const variableId = fieldId(initializedVariable, "VARIABLE");
  const decreases = blocks.some((block) => block.opcode === "data_changevariableby"
    && fieldId(block, "VARIABLE") === variableId && numberInput(block.inputs.VALUE, blockMap, 0) < 0);
  const opcodes = new Set(blocks.map((block) => block.opcode));
  const waits = blocks.some((block) => block.opcode === "control_wait"
    && numberInput(block.inputs.DURATION, blockMap, 0) >= 0.5);
  const checksZero = blocks.some((block) => block.opcode === "operator_equals"
    && Object.values(block.inputs).some((input) => numberLiteralInInput(input) === 0));
  const initialized = Boolean(initializedVariable && variableId);
  const countdown = initialized && opcodes.has("control_repeat_until") && waits && decreases;
  const finishes = checksZero && opcodes.has("control_stop");

  return result([
    { id: "timer-variable", passed: initialized, detail: initialized ? "綠旗開始後會設定時間初始值。" : "請在綠旗程式中將遊戲時間設為大於零。" },
    { id: "timer-countdown", passed: countdown, detail: countdown ? "倒數流程會等待一秒，再減少同一個時間變數。" : "請在重複直到中等待一秒，並將遊戲時間減少一。" },
    { id: "timer-finish", passed: finishes, detail: finishes ? "時間等於零後會停止遊戲。" : "請判斷時間等於零，並停止遊戲或進入結束流程。" },
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
    } else if (block.opcode === "motion_changexby") {
      state.x += numberInput(block.inputs.DX, blocks, 0);
      if (insideRepeat) state.coordinateAxes.add("x");
      pushPoint(state);
    } else if (block.opcode === "motion_changeyby") {
      state.y += numberInput(block.inputs.DY, blocks, 0);
      if (insideRepeat) state.coordinateAxes.add("y");
      pushPoint(state);
    } else if (block.opcode === "motion_setx") {
      state.x = numberInput(block.inputs.X, blocks, state.x);
      if (insideRepeat) state.coordinateAxes.add("x");
      pushPoint(state);
    } else if (block.opcode === "motion_sety") {
      state.y = numberInput(block.inputs.Y, blocks, state.y);
      if (insideRepeat) state.coordinateAxes.add("y");
      pushPoint(state);
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

function collectScriptBlocks(startId: string | null, blocks: Record<string, ScratchBlock>) {
  const found: ScratchBlock[] = [];
  const visited = new Set<string>();

  function visit(start: string | null) {
    let id = start;
    let guard = 0;
    while (id && guard < 500 && !visited.has(id)) {
      const block = blocks[id];
      if (!block) break;
      visited.add(id);
      found.push(block);
      Object.values(block.inputs).forEach((input) => visit(blockReference(input, blocks)));
      id = block.next;
      guard += 1;
    }
  }

  visit(startId);
  return found;
}

function topScript(
  target: ScratchTarget,
  opcode: string,
  predicate: (block: ScratchBlock) => boolean = () => true,
) {
  const top = Object.values(target.blocks).find((block) => block.topLevel && block.opcode === opcode && predicate(block));
  return top ? [top, ...collectScriptBlocks(top.next, target.blocks)] : [];
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

function fieldText(block: ScratchBlock | undefined, name: string) {
  const field = block?.fields?.[name];
  return Array.isArray(field) && typeof field[0] === "string" ? field[0] : "";
}

function fieldId(block: ScratchBlock | undefined, name: string) {
  const field = block?.fields?.[name];
  return Array.isArray(field) && typeof field[1] === "string" ? field[1] : "";
}

function variableIdsInInput(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const own = input[0] === 12 && typeof input[2] === "string" ? [input[2]] : [];
  return [...own, ...input.flatMap(variableIdsInInput)];
}

function numberLiteralInInput(input: unknown): number | null {
  if (!Array.isArray(input)) return null;
  if ([4, 5, 6, 7, 8, 10].includes(Number(input[0]))) {
    const value = Number(input[1]);
    if (Number.isFinite(value)) return value;
  }
  for (const item of input) {
    const value = numberLiteralInInput(item);
    if (value !== null) return value;
  }
  return null;
}

function keyName(input: ScratchInput | undefined, sprites: ScratchTarget[]) {
  for (const sprite of sprites) {
    const id = blockReference(input, sprite.blocks);
    if (!id) continue;
    const field = sprite.blocks[id]?.fields?.KEY_OPTION;
    if (Array.isArray(field) && typeof field[0] === "string") return field[0];
  }
  return "";
}

function numberInputFromAnySprite(input: ScratchInput | undefined, sprites: ScratchTarget[]) {
  for (const sprite of sprites) {
    const value = numberInput(input, sprite.blocks, Number.NaN);
    if (Number.isFinite(value)) return value;
  }
  return Number.NaN;
}

function numberInputFromTargets(input: ScratchInput | undefined, targets: ScratchTarget[], fallback: number) {
  for (const target of targets) {
    const value = numberInput(input, target.blocks, Number.NaN);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
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

function coordinateQuality(state: MotionState) {
  return state.points.length + (state.hasInitialPosition ? 1000 : 0) + state.coordinateAxes.size * 1000;
}

function controllerQuality(blocks: ScratchBlock[], sprites: ScratchTarget[]) {
  const opcodes = new Set(blocks.map((block) => block.opcode));
  const keyCount = blocks.filter((block) => block.opcode === "sensing_keypressed")
    .map((block) => keyName(block.inputs.KEY_OPTION, sprites))
    .filter(Boolean).length;
  return keyCount * 100 + (opcodes.has("control_forever") ? 1000 : 0);
}

function timerQuality(blocks: ScratchBlock[]) {
  const wanted = new Set([
    "data_setvariableto",
    "control_repeat_until",
    "control_wait",
    "data_changevariableby",
    "operator_equals",
    "control_stop",
  ]);
  return blocks.filter((block) => wanted.has(block.opcode)).length;
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
