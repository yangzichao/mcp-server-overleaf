import { rmSync } from "node:fs";

// A removed source file must never survive in the next published package.
rmSync(new URL("../../dist/", import.meta.url), { recursive: true, force: true });
