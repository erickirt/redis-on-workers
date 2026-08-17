import { $ } from "bun";
import { tegami, type TegamiPlugin } from "tegami";
import { createCli } from "tegami/cli";
import { github } from "tegami/plugins/github";

// tegami serializes changelogs/manifests in a style oxfmt rejects; reformat
// before the github plugin stages and commits the version branch.
const oxfmt: TegamiPlugin = {
  name: "oxfmt",
  enforce: "pre",
  async applyCliDraft() {
    await $`oxfmt --write .`.quiet();
  },
};

const refreshLockfile: TegamiPlugin = {
  name: "refresh-lockfile",
  async applyCliDraft() {
    await $`bun install`.quiet();
  },
};

const paper = tegami({
  plugins: [
    oxfmt,
    refreshLockfile,
    github({ repo: "kane50613/redis-on-workers", versionPr: { base: "master" } }),
  ],
  npm: { client: "bun", updateLockFile: true },
});

void createCli(paper).parseAsync();
