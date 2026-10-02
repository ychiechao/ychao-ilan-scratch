import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(root, "course-templates", "yilan-scratch-12");
const outputPath = join(root, "app", "course-template-reference-data.json");
const fileNames = (await readdir(sourceDirectory))
  .filter((name) => name.toLowerCase().endsWith(".sb3"))
  .sort((left, right) => left.localeCompare(right, "en"));

const files = {};
for (const fileName of fileNames) {
  const bytes = new Uint8Array(await readFile(join(sourceDirectory, fileName)));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const archive = unzipSync(bytes, { filter: (entry) => entry.name === "project.json" });
  const project = JSON.parse(strFromU8(archive["project.json"]));
  const analysis = summarizeProject(project, fileName, bytes.byteLength, sha256);
  const stem = fileName.replace(/\.sb3$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  files[fileName] = {
    fileName,
    fileSize: bytes.byteLength,
    sha256,
    storageKey: `reference/template_yilan_scratch_${stem}.sb3`,
    analysis,
  };
}

await writeFile(outputPath, `${JSON.stringify({ schemaVersion: 1, files }, null, 2)}\n`);
console.log(`Generated ${Object.keys(files).length} Scratch reference records.`);

function summarizeProject(project, fileName, fileSize, sha256) {
  const targets = (project.targets ?? []).filter((target) => target && target.blocks);
  if (!targets.some((target) => !target.isStage)) throw new Error(`${fileName} does not contain a sprite.`);
  const blockCounts = {};
  const variables = new Set();
  const broadcasts = new Set();
  const extensions = new Set();
  let costumeCount = 0;
  let backdropCount = 0;
  let soundCount = 0;

  const targetSummaries = targets.map((target, index) => {
    const blocks = target.blocks ?? {};
    const opcodes = Object.values(blocks).flatMap((block) => block.opcode ? [block.opcode] : []);
    for (const opcode of opcodes) {
      blockCounts[opcode] = (blockCounts[opcode] ?? 0) + 1;
      const extension = extensionName(opcode);
      if (extension) extensions.add(extension);
    }
    for (const value of Object.values(target.variables ?? {})) {
      if (typeof value?.[0] === "string") variables.add(value[0]);
    }
    for (const value of Object.values(target.broadcasts ?? {})) {
      if (typeof value === "string") broadcasts.add(value);
    }
    const costumes = target.costumes?.length ?? 0;
    if (target.isStage) backdropCount += costumes;
    else costumeCount += costumes;
    soundCount += target.sounds?.length ?? 0;
    const scripts = Object.entries(blocks)
      .filter(([, block]) => block.topLevel)
      .map(([id, block]) => ({ event: block.opcode ?? "unknown", opcodes: collectScriptOpcodes(id, blocks) }));
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
    fileName,
    fileSize,
    sha256,
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

function collectScriptOpcodes(startId, blocks) {
  const found = [];
  const visited = new Set();
  const visit = (id) => {
    if (!id || visited.has(id)) return;
    visited.add(id);
    const block = blocks[id];
    if (!block) return;
    if (block.opcode) found.push(block.opcode);
    for (const input of Object.values(block.inputs ?? {})) {
      for (const value of input) if (typeof value === "string" && blocks[value]) visit(value);
    }
    visit(block.next);
  };
  visit(startId);
  return found;
}

function extensionName(opcode) {
  const prefix = opcode.split("_")[0];
  return ["pen", "music", "videoSensing", "text2speech", "translate", "makeymakey", "microbit", "ev3", "wedo2", "boost", "gdxfor"].includes(prefix) ? prefix : "";
}
