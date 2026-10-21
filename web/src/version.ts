// The site's version (package.json, Semantic Versioning), set by vite.config.ts. No build date: every
// scheduled update rebuilds the site, so it would only be the date of the last check.
// Tests run without the build defines, hence the typeof check.

declare const __APP_VERSION__: string;

export const VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
