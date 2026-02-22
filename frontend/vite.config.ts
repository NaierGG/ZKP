import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      // Required for some ZKP/crypto packages in browser
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    include: ["buffer"],
    esbuildOptions: {
      target: "esnext",
    },
  },
  build: {
    target: "esnext",
  },
});
