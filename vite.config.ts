import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
  },
  preview: {
    // `npm run start` (production `vite preview`, see railway.json) is
    // reached through Railway's generated *.up.railway.app domain or a
    // custom one — Vite's preview server otherwise rejects any Host header
    // it doesn't already know about (a security default aimed at "someone
    // runs `vite preview` on their laptop", not "this IS the deployed
    // server"). `true` trusts every Host, which is fine here since this
    // process only ever serves this app's own static build, nothing
    // sensitive keyed off the Host header.
    allowedHosts: true,
  },
})
