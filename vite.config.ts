import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages 專案網址在 /xuanqing-radar/ 底下；本機開發用根目錄
export default defineConfig(({ command }) => ({
  base: command === "build" ? process.env.BASE_PATH ?? "/xuanqing-radar/" : "/",
  plugins: [react(), tailwindcss()],
}));
