import * as esbuild from "esbuild";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const result = await esbuild.build({
  entryPoints: ["src/setup.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  conditions: ["node", "import"],
  outfile: "dist/setup/index.js",
  metafile: true,
});

// Generate licenses.txt from bundled packages
const packages = new Set<string>();
for (const file of Object.keys(result.metafile!.inputs)) {
  const match = file.match(/^node_modules\/(@[^/]+\/[^/]+|[^/]+)\//);
  if (match) packages.add(match[1]);
}

let content = "";
for (const pkg of [...packages].sort()) {
  const dir = join("node_modules", pkg);
  const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const licFile = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  const licText = licFile
    ? readFileSync(join(dir, licFile), "utf8").trim()
    : "";
  content += `${pkg}\n${meta.license || "UNKNOWN"}\n${licText}\n\n`;
}

writeFileSync("dist/setup/licenses.txt", content.trimEnd() + "\n");
