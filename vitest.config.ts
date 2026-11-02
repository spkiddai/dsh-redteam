import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/client/index.tsx', 'src/client/styles.ts'],
      include: ['src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
    include: ['tests/**/*.spec.{ts,tsx}'],
    testTimeout: 10_000,
  },
})
