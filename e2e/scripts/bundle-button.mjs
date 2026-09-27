// Phase 1 evidence: what a page pays for `import { Button } from "@lumen/ui"`.
// Bundles one entry per case with esbuild (minified, tree-shaken, React and
// react-dom external because every page already has them) and writes the
// sizes plus esbuild metafiles to docs/evidence/phase-01/bundle/.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "docs/evidence/phase-01/bundle");
mkdirSync(out, { recursive: true });

const cases = {
  "button-only": 'import { Button } from "@lumen/ui/components"; console.log(Button);',
  "whole-kit": 'import * as kit from "@lumen/ui/components"; console.log(kit);',
};

const rows = [];
for (const [name, contents] of Object.entries(cases)) {
  const result = await build({
    stdin: { contents, resolveDir: join(root, "apps/web"), loader: "tsx" },
    bundle: true,
    minify: true,
    treeShaking: true,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    write: false,
    metafile: true,
    external: ["react", "react-dom", "react/jsx-runtime", "*.css"],
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "error",
  });
  const code = result.outputFiles[0].contents;
  const gzip = gzipSync(code).length;
  writeFileSync(join(out, `${name}.meta.json`), JSON.stringify(result.metafile));
  const inputs = Object.entries(Object.values(result.metafile.outputs)[0].inputs)
    .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
    .slice(0, 12)
    .map(
      ([file, info]) =>
        `  ${String(info.bytesInOutput).padStart(8)}  ${file.replace(/.*node_modules[\/]\.pnpm[\/]/, "")}`,
    );
  rows.push(
    `${name}: ${code.length} B minified, ${gzip} B gzip\nlargest inputs:\n${inputs.join("\n")}`,
  );
}
const report = rows.join("\n\n");
writeFileSync(join(out, "report.txt"), report + "\n");
console.log(report);
