import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart(), react()],
  resolve: { tsconfigPaths: true },
  server: {
    host: true,
    port: 5173,
    allowedHosts: [
      ".trycloudflare.com",
      "pr.dostcaraga.ph",
    ],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true, 
      },
    },
  },
});