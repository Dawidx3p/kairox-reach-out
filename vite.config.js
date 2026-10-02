import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/data/**", "**/server/**"] },
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
