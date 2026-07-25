import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const projectRoot = process.cwd();
const vinextCli = path.join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
let buildRoot = projectRoot;

// Rolldown currently terminates early on this Windows environment when the
// project path contains non-ASCII characters. Build through a stable ASCII
// junction while keeping all output in the real project directory.
if (process.platform === "win32" && /[^\x00-\x7f]/.test(projectRoot)) {
  const projectKey = createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
  const junction = path.join(tmpdir(), `dividend-simulator-${projectKey}`);

  if (existsSync(junction)) {
    if (realpathSync(junction) !== realpathSync(projectRoot)) {
      throw new Error(`Unexpected build junction target: ${junction}`);
    }
  } else {
    symlinkSync(projectRoot, junction, "junction");
  }

  buildRoot = junction;
}

const result = spawnSync(process.execPath, [vinextCli, "build"], {
  cwd: buildRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
