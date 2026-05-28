import * as esbuild from "esbuild";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Bundle {
  entry: string;
  outdir: string;
}

const bundles: Bundle[] = [
  { entry: "src/setup.ts", outdir: "dist/setup" },
  { entry: "src/save-cache.ts", outdir: "dist/save-cache" },
];

for (const { entry, outdir } of bundles) {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    target: "node24",
    format: "cjs",
    conditions: ["node", "import"],
    outfile: `${outdir}/index.js`,
    metafile: true,
  });

  // The root package.json declares "type": "module". Drop a CommonJS shim so
  // Node treats the bundled dist/<entry>/index.js as CJS (esbuild emits CJS).
  writeFileSync(`${outdir}/package.json`, '{"type":"commonjs"}\n');

  // Generate licenses.txt from bundled packages
  const packages = new Set<string>();
  for (const file of Object.keys(result.metafile.inputs)) {
    const match = file.match(/^node_modules\/(@[^/]+\/[^/]+|[^/]+)\//);
    if (match?.[1]) packages.add(match[1]);
  }

  let content = "";
  for (const pkg of [...packages].sort()) {
    const dir = join("node_modules", pkg);
    const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      license?: string;
    };
    const licFile = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
    const licText = licFile ? readFileSync(join(dir, licFile), "utf8").trim() : "";
    content += `${pkg}\n${meta.license ?? "UNKNOWN"}\n${licText}\n\n`;
  }

  writeFileSync(`${outdir}/licenses.txt`, content.trimEnd() + "\n");
}
