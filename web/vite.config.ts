import { defineConfig, type Plugin } from "vite";
import pkg from "./package.json";

/**
 * Put the stylesheet inside index.html: the first paint (the skeleton, in the right theme) then needs one
 * request instead of two. That's what makes a slow connection show something at once instead of a white screen.
 */
function inlineCss(): Plugin {
  return {
    name: "inline-css",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const html = bundle["index.html"];
      if (!html || html.type !== "asset") return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type !== "asset" || !name.endsWith(".css")) continue;
        const link = new RegExp(`<link rel="stylesheet"[^>]*href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`);
        if (!link.test(source)) continue;
        source = source.replace(link, () => `<style>${String(file.source)}</style>`);
        delete bundle[name];
      }
      html.source = source;
    },
  };
}

// Relative base so the build works under any path (e.g. GitHub Pages /ur_timetable/).
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [inlineCss()],
});
