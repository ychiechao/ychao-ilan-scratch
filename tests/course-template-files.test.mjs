import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";

const root = process.cwd();
const data = JSON.parse(await readFile(join(root, "app", "course-template-reference-data.json"), "utf8"));

test("Yilan Scratch template preserves all supplied originals", async () => {
  assert.equal(data.schemaVersion, 1);
  assert.equal(Object.keys(data.files).length, 14);
  for (const [name, entry] of Object.entries(data.files)) {
    const bytes = new Uint8Array(await readFile(join(root, "course-templates", "yilan-scratch-12", name)));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    assert.equal(bytes.byteLength, entry.fileSize);
    assert.equal(entry.analysis.valid, true);
    assert.ok(entry.analysis.spriteCount >= 1);
    const archive = unzipSync(bytes, { filter: (item) => item.name === "project.json" });
    assert.doesNotThrow(() => JSON.parse(strFromU8(archive["project.json"])));
  }
});

test("template mappings use the teacher-confirmed source files", async () => {
  const source = await readFile(join(root, "app", "api", "courses", "route.ts"), "utf8");
  const expected = [
    "11508-70001.sb3", "11508-70001-02.sb3", "11508-70001-03.sb3",
    "11508-70001-03-02.sb3", "11508-70001-05.sb3", "11508-70001-06.sb3",
    "11508-70001-07.sb3", "11508-70001-08.sb3", "11508-70001-09.sb3",
    "11508-70001-10.sb3", "11508-70001-11.sb3", "11508-70001-12.sb3",
    "11508-70001-13.sb3",
  ];
  for (const name of expected) assert.match(source, new RegExp(name.replaceAll(".", "\\.")));
});
