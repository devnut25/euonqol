import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
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
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
  {
    // Patient-facing public flow must meet WCAG 2.2 AA — lint its JSX for a11y.
    files: [
      'src/pages/PublicQuestionnaire.tsx',
      'src/pages/public/**/*.{ts,tsx}',
      'src/components/public/**/*.{ts,tsx}',
      'src/layouts/SplitScreenLayout.tsx',
    ],
    extends: [jsxA11y.flatConfigs.recommended],
  },
  {
    // shadcn/ui generated files: variant helpers and hooks co-located with components
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // TanStack Table returns functions incompatible with React Compiler memoization by design
    files: ['src/hooks/useDataTable.ts'],
    rules: {
      'react-hooks/incompatible-library': 'off',
    },
  },
])
