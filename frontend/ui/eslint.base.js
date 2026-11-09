import tseslint from 'typescript-eslint';

/** Shared frontend lint rules. Frontend may import only from shared and frontend/ui, never from backend. */
export default tseslint.config(
  { ignores: ['dist', '.next', 'node_modules', 'playwright-report', 'test-results', 'public/mockServiceWorker.js', 'dev-dist'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['**/backend/**', '@thunikart/backend', '@thunikart/backend/*'], message: 'Frontend must not import from backend. Use @thunikart/shared.' },
      ] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
