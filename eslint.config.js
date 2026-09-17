import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
export default ts.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.browser-cache/**',
      '.npm-cache/**',
      '.mtg-data/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['**/*.{js,mjs,ts,tsx}'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['src/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
