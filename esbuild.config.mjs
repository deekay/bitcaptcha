import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "BitCaptcha",
  outfile: "dist/widget.js",
  minify: !watch,
  sourcemap: watch,
  target: "es2020",
  metafile: true,
  treeShaking: true,
  define: {
    "process.env.NODE_ENV": watch ? '"development"' : '"production"',
  },
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  const result = await esbuild.build(config);
  const text = await esbuild.analyzeMetafile(result.metafile);
  console.log(text);
  const bytes = result.outputFiles
    ? result.outputFiles[0].contents.byteLength
    : undefined;
  console.log(`Output: dist/widget.js`);
}
