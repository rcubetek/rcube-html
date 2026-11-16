// The <rcube-form> element for pages that aren't React (Angular, Vue, plain JavaScript, server pages): built after
// tsup.config.js, with React INSIDE (the page doesn't install it).
//   dist/element/*.js   ES modules for bundlers: rcube-html/element (everything), rcube-html/element/core, /table, …
//                       and rcube-html/vue. Shared code is in chunks, so they all use one React and one registry.
//   dist/browser/*.js   one <script> each, no bundler needed: rcube-html.js (everything), rcube-html.core.js (forms),
//                       rcube-site.js (websites drawn from data files)
//   dist/cli/           the rcube-html command (render), React inside
import { defineConfig } from "tsup";

const shared = {
  loader: { ".js": "jsx", ".css": "text" },
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
  // React's production build, whatever the page's bundler sets (it may set nothing: Angular, a plain <script>)
  define: { "process.env.NODE_ENV": '"production"' },
  noExternal: ["react", "react-dom", "scheduler"],
  target: "es2020",
  sourcemap: true,
  clean: false,
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: "src/element/index.js",
      core: "src/element/core.js",
      table: "src/element/table.js",
      chart: "src/element/chart.js",
      calendar: "src/element/calendar.js",
      tree: "src/element/tree.js",
      richtext: "src/element/richtext.js",
      upload: "src/element/upload.js",
      vue: "src/element/vue.js",
    },
    outDir: "dist/element",
    format: ["esm"],
    splitting: true,
    external: ["vue"],
  },
  {
    ...shared,
    entry: { "rcube-html": "src/browser.js", "rcube-html.core": "src/browser-core.js" },
    outDir: "dist/browser",
    format: ["iife"],
    globalName: "RcubeHtml",
    outExtension: () => ({ js: ".js" }),
    minify: true,
  },
  {
    // dist/browser/rcube-site.js: draws a website from data files with rcube-html.js (no React of its own)
    ...shared,
    entry: { "rcube-site": "src/site/browser.js" },
    outDir: "dist/browser",
    format: ["iife"],
    outExtension: () => ({ js: ".js" }),
    minify: true,
  },
  {
    // dist/cli/rcube-html.cjs: the command line (bin/rcube-html.js), React inside — the same React as the browser
    // bundle, so pages it draws are taken over (hydrated) without differences
    ...shared,
    entry: { "rcube-html": "src/cli.js" },
    outDir: "dist/cli",
    format: ["cjs"],
    platform: "node",
    outExtension: () => ({ js: ".cjs" }),
  },
]);
