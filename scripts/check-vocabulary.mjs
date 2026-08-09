import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["apps", "packages"];
const ignoredDirectories = new Set([".next", "coverage", "node_modules"]);
const legacyRole = new RegExp(`\\b${"b" + "oss"}\\b`, "i");
const findings = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(entryPath);
      continue;
    }

    const contents = await readFile(entryPath, "utf8").catch(() => null);
    if (contents === null) continue;
    contents.split("\n").forEach((line, index) => {
      if (legacyRole.test(line)) findings.push(`${entryPath}:${index + 1}`);
    });
  }
}

for (const root of roots) await scan(root);

if (findings.length > 0) {
  console.error(`Rejected role vocabulary found:\n${findings.join("\n")}`);
  process.exit(1);
}

console.log("Vocabulary check passed.");
