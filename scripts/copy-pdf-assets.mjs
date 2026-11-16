// Copies the pdf.js worker, CMaps and standard fonts into /public so the browser can load them.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
const out = join(process.cwd(), "public", "pdfjs");

mkdirSync(out, { recursive: true });
cpSync(join(root, "build", "pdf.worker.min.mjs"), join(out, "pdf.worker.min.mjs"));
cpSync(join(root, "cmaps"), join(out, "cmaps"), { recursive: true });
cpSync(join(root, "standard_fonts"), join(out, "standard_fonts"), { recursive: true });
console.log("pdf.js assets copied to public/pdfjs");
