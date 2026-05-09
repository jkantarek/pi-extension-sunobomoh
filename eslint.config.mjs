import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import jsdocExamplesOnly from './eslint-rules/jsdoc-examples-only.mjs';

const localPlugin = {
  rules: { 'jsdoc-examples-only': jsdocExamplesOnly },
};

const SRC = 'src/**/*.{ts,tsx}';

export default tseslint.config(
  // Files to never lint
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'eslint.config.mjs',
      '*.config.js',
      '*.config.cjs',
      '.github/**',
      '.pi/**',
      'html/**',
    ],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript strict + stylistic (scoped to src only)
  ...tseslint.configs.strictTypeChecked.map((c) => ({ ...c, files: [SRC] })),
  ...tseslint.configs.stylisticTypeChecked.map((c) => ({ ...c, files: [SRC] })),

  // SonarJS recommended — registers plugin + all recommended rules, scoped to src
  { ...sonarjs.configs.recommended, files: [SRC] },

  // Tooling config files — parse with node tsconfig, light rules only
  {
    files: ['*.config.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.node.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  {
    files: [SRC],
    plugins: { local: localPlugin },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Enforce explicit return types everywhere
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',

      // No any, ever
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

      // Enforce consistent patterns
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // Naming conventions
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'interface', format: ['PascalCase'] },
        { selector: 'typeAlias', format: ['PascalCase'] },
        { selector: 'enum', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        { selector: 'class', format: ['PascalCase'] },
      ],

      // Misc strictness
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',

      // File length: max 150 non-comment lines
      'max-lines': ['error', { max: 150, skipComments: true, skipBlankLines: false }],

      // Low-complexity, DDD-aligned constraints
      complexity: ['error', { max: 7 }],
      'max-lines-per-function': ['error', { max: 10, skipComments: true, skipBlankLines: false }],
      'max-params': ['error', { max: 5 }],

      // All JSDoc must be executable @example doctests — no prose, no @param/@returns
      'local/jsdoc-examples-only': 'error',

      // SonarJS overrides — turn off rules duplicated by typescript-eslint,
      // or rules too noisy for this codebase's conventions
      'sonarjs/todo-tag': 'off', // teams use TODO comments intentionally
      'sonarjs/fixme-tag': 'off', // same
      'sonarjs/no-commented-code': 'off', // commented examples exist in doctests
      'sonarjs/no-unused-vars': 'off', // @typescript-eslint/no-unused-vars covers this
      'sonarjs/class-name': 'off', // @typescript-eslint/naming-convention covers this
      'sonarjs/no-unused-function-argument': 'off', // @typescript-eslint/no-unused-vars covers this
      'sonarjs/no-parameter-reassignment': 'off', // prefer-const covers this
      // cognitive-complexity is separate from cyclomatic; allow higher ceiling for
      // orchestration functions that are inherently sequential
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },

  // Disable formatting rules that conflict with Prettier
  prettier,

  // Test files: relax function-length limit so describe/it blocks can hold
  // multiple assertions without being split unnecessarily.
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}'],
    rules: {
      'max-lines-per-function': ['error', { max: 60, skipComments: true, skipBlankLines: false }],
    },
  },
);
