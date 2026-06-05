import { rmSync } from "node:fs";
import { resolve } from "node:path";

const cachePath = resolve(process.cwd(), "node_modules", ".vite");
rmSync(cachePath, { recursive: true, force: true });
console.log(`✅ Cache Vite dibersihkan: ${cachePath}`);
