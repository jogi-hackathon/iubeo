import {defineConfig, mergeConfig} from "../frontend/node_modules/vite/dist/node/index.js";
import {createRequire} from "node:module";
import base from "../frontend/vite.config";

const req = createRequire(new URL("../frontend/package.json", import.meta.url));
const dep = (name: string) => req.resolve(name);

const crowdScene = {
  name: "perf-crowd-scene",
  transform(code: string, id: string) {
    if (id.endsWith("src/scenes/index.ts")) {
      return code
        .replace(/^/, 'import {CrowdScene} from "../../../perf/scenes/CrowdScene.tsx";\n')
        .replace("const devScenes = {", "const devScenes = {\n  crowd: CrowdScene,");
    }
    if (id.endsWith("src/scenes/sceneStore.ts")) {
      return code.replace(
        'initial: import.meta.env.DEV ? "test" : "room"',
        'initial: new URLSearchParams(location.search).get("scene") ?? "test"',
      );
    }
    return null;
  },
};

const exposeSettings = {
  name: "perf-expose-postprocess-settings",
  transform(code: string, id: string) {
    if (!id.endsWith("camera/postprocess/settings.ts")) return null;
    return `${code}\n;globalThis.__pp = {updatePostProcessSettings, DEFAULT_POSTPROCESS_SETTINGS};\n`;
  },
};

const noAA = {
  name: "perf-no-antialias",
  transform(code: string, id: string) {
    if (process.env.PERF_NOAA !== "1" || !id.endsWith("src/core/renderer.ts")) return null;
    return code.replace("new WebGPURenderer({", "new WebGPURenderer({antialias: false, ");
  },
};

const warmLog = {
  name: "perf-warmup-log",
  transform(code: string, id: string) {
    if (!id.endsWith("src/core/warmupTracker.ts")) return null;
    return code
      .replace(
        "let changedAt = start;",
        'let changedAt = start;\n  (globalThis.__warmLog ??= []).push(["start", start]);',
      )
      .replace(
        "if (held || signature !== last) {",
        'if (signature !== last) (globalThis.__warmLog ??= []).push(["changed", now, signature.split(",").length]);\n      else if (held) (globalThis.__warmLog ??= []).push(["held", now]);\n      if (held || signature !== last) {',
      );
  },
};

export default defineConfig((env) =>
  mergeConfig(base(env), {
    define: {"import.meta.env.DEV": "true"},
    resolve: {
      alias: [
        {find: /^react\/jsx-runtime$/, replacement: dep("react/jsx-runtime")},
        {find: /^react$/, replacement: dep("react")},
        {find: /^@react-three\/fiber$/, replacement: dep("@react-three/fiber")},
        {find: /^three\/webgpu$/, replacement: dep("three/webgpu")},
        {find: /^three$/, replacement: dep("three/webgpu")},
        {find: /^three\/tsl$/, replacement: dep("three/tsl")},
      ],
    },
    plugins: [crowdScene, exposeSettings, noAA, warmLog],
  }),
);
