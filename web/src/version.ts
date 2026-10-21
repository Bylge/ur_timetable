// The site's version (package.json, Semantic Versioning; 0.x = demo) and build date, set by vite.config.ts.
// Tests run without the build defines, hence the typeof checks.

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export const VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
export const BUILD_DATE: string = typeof __BUILD_DATE__ === "string" ? __BUILD_DATE__ : "";
