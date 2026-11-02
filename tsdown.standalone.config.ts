import type { UserConfig } from 'tsdown'
export default [
  {
    entry: { server: 'src/server/main.ts' },
    outDir: 'standalone/dist',
    platform: 'node',
    format: 'esm',
    outputOptions: { entryFileNames: 'server.js' },
    target: 'node24',
    dts: false,
    clean: true,
    deps: { neverBundle: ['pg', '@electric-sql/pglite'], alwaysBundle: [/^zod/, /^tldts/] },
    sourcemap: true,
  },
  {
    entry: { app: 'src/client/standalone/main.tsx' },
    outDir: 'standalone/dist',
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    dts: false,
    clean: false,
    deps: { alwaysBundle: [/.*/] },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    sourcemap: true,
  },
] satisfies UserConfig[]
