import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./", // Essential for file:// protocol and pywebview bundling

  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  envPrefix: ["VITE_", "TAURI_"],

  build: {
    target: "chrome105",
    outDir: "dist",
    emptyOutDir: true,
    minify: "esbuild",
    sourcemap: false,
  },
});
