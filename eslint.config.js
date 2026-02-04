import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import prettierPlugin from 'eslint-plugin-prettier'

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      'no-undef': 'off',
      ...tseslint.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'prettier/prettier': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['src/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        performance: 'readonly',
        PerformanceObserver: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        location: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        confirm: 'readonly',
        KeyboardEvent: 'readonly',
        NodeJS: 'readonly',
      },
    },
  },
  {
    files: ['src/web/server/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        Request: 'readonly',
        Headers: 'readonly',
        TextEncoder: 'readonly',
      },
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      'playwright-report/',
      'test-results/',
      'e2e/',
      '*.config.js',
      '*.config.ts',
      'bun.lock',
    ],
  },
]
