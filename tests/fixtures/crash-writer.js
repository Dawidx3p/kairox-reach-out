import { createWorkspace } from "../../src/domain.js";
import { createWorkspaceStore } from "../../server/workspace-store.js";

const [dataDir, etag] = process.argv.slice(2);
const workspace = createWorkspace(new Date("2026-10-02T12:00:00.000Z"));
workspace.settings.icp.target = "wersja z przerwanego procesu";

const store = createWorkspaceStore({
  dataDir,
  async onStage(stage) {
    if (stage !== "before-rename") return;
    process.send?.("before-rename");
    await new Promise(() => {});
  },
});

await store.write(workspace, etag);
