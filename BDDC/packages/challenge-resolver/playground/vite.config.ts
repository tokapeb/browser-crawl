import { fileURLToPath } from "node:url"
import { defineConfig, type Plugin } from "vite"

function inlineSingleFile(): Plugin {
  return {
    name: "playground-inline-single-file",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const htmlAsset = Object.values(bundle).find(
        (b): b is { type: "asset"; fileName: string; source: string } => b.type === "asset" && b.fileName.endsWith(".html"),
      )
      const jsChunk = Object.values(bundle).find(
        (b): b is { type: "chunk"; fileName: string; code: string } => b.type === "chunk",
      )
      if (!htmlAsset || !jsChunk) return
      htmlAsset.source = htmlAsset.source
        .replace(/<!-- playground:file-banner[\s\S]*?<\/script>/, "")
        .replace(/<link rel="modulepreload"[^>]*>/g, "")
        .replace(
          /<script type="module" crossorigin src="[^"]+"><\/script>/,
          () => `<script type="module">\n${jsChunk.code}\n</script>`,
        )
      delete bundle[jsChunk.fileName]
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      "challenge-resolver": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [inlineSingleFile()],
})
