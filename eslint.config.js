import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Project convention: a leading underscore marks a parameter or
      // destructured binding as deliberately unused — e.g. a player-safe
      // projection function that accepts an argument it intentionally never
      // reads (no safe shape exists yet, see playerSafeProjection.ts), or a
      // destructure used purely to strip a DM-only field before spreading
      // the rest. Narrow, behavior-preserving rule tweak (Stage 5G) — not a
      // blanket disable.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
])
