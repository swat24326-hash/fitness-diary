import js from '@eslint/js'
import globals from 'globals'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const reactJsxRuntime = reactPlugin.configs.flat['jsx-runtime']

/** Мягкий набор правил: мало шума, без TypeScript. */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'supabase/functions/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    ...reactJsxRuntime,
    languageOptions: {
      ...reactJsxRuntime.languageOptions,
      globals: { ...globals.browser, __FITNESS_DIARY_BUILD_TIME__: 'readonly' },
      parserOptions: {
        ...reactJsxRuntime.languageOptions?.parserOptions,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      ...reactJsxRuntime.plugins,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactJsxRuntime.rules,
      ...reactHooks.configs.recommended.rules,
      // jsx-runtime отключает только react-in-jsx-scope; без этого no-unused-vars ругается на <Component />
      'react/jsx-uses-vars': 'error',
      // Контекст и крупные модули экспортируют не только компоненты — не шумим в CI
      'react-refresh/only-export-components': 'off',
      'react/prop-types': 'off',
      // Слишком шумно на существующем коде; hooks rules остаются включены
      'react-hooks/exhaustive-deps': 'off',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    files: ['api/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}', 'server/**/*.{js,mjs}', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
]
