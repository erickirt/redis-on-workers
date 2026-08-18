import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  external: ["cloudflare:sockets", "@arrowood.dev/socket"],
  format: ["esm", "cjs"],
  dts: true,
  publint: {
    enabled: "ci-only",
    level: "error",
  },
  clean: true,
});
