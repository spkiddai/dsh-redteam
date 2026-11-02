import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadExternalToolPlugins,
  loadExternalToolPluginsFromEnvironment,
} from '../../tools/src/plugin-loader.js'
import { defineToolPlugin, type RedTeamToolPlugin } from '../../tools/src/plugin.js'
import { createRedTeamToolsServer } from '../../tools/src/server.js'
import {
  commandToolResult,
  configuredBinary,
  resolveExecutable,
  runLocalCommand,
  unavailableToolResult,
} from '../../tools/src/runtime.js'
import {
  normalizeHostTarget,
  normalizeHttpUrl,
  normalizeMetasploitModule,
  normalizeMetasploitQuery,
  normalizeNucleiTag,
  normalizePorts,
  normalizeTargetUri,
} from '../../tools/src/validation.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

async function fakeExecutable(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-redteam-mcp-tools-'))
  temporaryDirectories.push(directory)
  const executable = join(directory, 'fake-security-tool')
  await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$@"\n')
  await chmod(executable, 0o755)
  return executable
}

async function connectedClient() {
  const server = createRedTeamToolsServer()
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, server }
}

describe('local security tools MCP server', () => {
  it('publishes the four local adapter families through MCP', async () => {
    const server = createRedTeamToolsServer()
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'burp_proxy_request',
      'burp_status',
      'metasploit_check',
      'metasploit_module_info',
      'metasploit_search',
      'metasploit_status',
      'nmap_scan',
      'nmap_status',
      'nuclei_scan',
      'nuclei_status',
    ])

    await client.close()
    await server.close()
  })

  it('loads a custom extension from a directory named after the plugin', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-redteam-custom-tool-'))
    temporaryDirectories.push(directory)
    const pluginDirectory = join(directory, 'custom-status')
    await mkdir(pluginDirectory)
    await writeFile(
      join(pluginDirectory, 'index.mjs'),
      `export default {
        name: 'custom-status',
        register(server) {
          server.registerTool(
            'custom_status',
            {
              description: 'Custom extension status.',
              annotations: { openWorldHint: false, readOnlyHint: true },
            },
            async () => ({
              content: [{ type: 'text', text: '{"available":true}' }],
              structuredContent: { available: true, tool: 'custom-status' },
            }),
          )
        },
      }`,
    )

    const plugins = await loadExternalToolPlugins([pluginDirectory])
    const server = createRedTeamToolsServer({ plugins })
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const tools = await client.listTools()
    expect(tools.tools.some((tool) => tool.name === 'custom_status')).toBe(true)
    const result = await client.callTool({ name: 'custom_status', arguments: {} })
    expect(result.structuredContent).toEqual({ available: true, tool: 'custom-status' })

    await client.close()
    await server.close()
  })

  it('rejects invalid custom extension layouts and duplicate plugin names', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-redteam-invalid-tool-'))
    temporaryDirectories.push(directory)

    expect(await loadExternalToolPluginsFromEnvironment('')).toEqual([])
    await expect(loadExternalToolPlugins([join(directory, 'missing')])).rejects.toThrow(
      '工具插件路径不存在',
    )

    const emptyDirectory = join(directory, 'empty-tool')
    await mkdir(emptyDirectory)
    await expect(loadExternalToolPlugins([emptyDirectory])).rejects.toThrow(
      '缺少 index.js 或 index.mjs',
    )

    const mismatchedDirectory = join(directory, 'expected-name')
    await mkdir(mismatchedDirectory)
    await writeFile(
      join(mismatchedDirectory, 'index.mjs'),
      "export default { name: 'different-name', register() {} }",
    )
    await expect(loadExternalToolPlugins([mismatchedDirectory])).rejects.toThrow('必须与插件名称')

    expect(() => defineToolPlugin({ name: 'Invalid Name', register() {} })).toThrow('插件名称')
    expect(() =>
      defineToolPlugin({ name: 'missing-register' } as unknown as RedTeamToolPlugin),
    ).toThrow('缺少 register()')
    expect(() => createRedTeamToolsServer({ plugins: [{ name: 'nmap', register() {} }] })).toThrow(
      '插件名称重复',
    )
  })

  it('stays available when a local binary has not been installed', async () => {
    vi.stubEnv('PRISM_NMAP_BIN', '/missing/prism-test-nmap')
    vi.stubEnv('PRISM_NUCLEI_BIN', '/missing/prism-test-nuclei')
    vi.stubEnv('PRISM_MSFCONSOLE_BIN', '/missing/prism-test-msfconsole')
    const server = createRedTeamToolsServer()
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const result = await client.callTool({ name: 'nmap_status', arguments: {} })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      available: false,
      command: '/missing/prism-test-nmap',
      tool: 'nmap',
    })
    for (const [name, tool] of [
      ['nuclei_status', 'nuclei'],
      ['metasploit_status', 'metasploit'],
    ] as const) {
      const status = await client.callTool({ name, arguments: {} })
      expect(status.structuredContent).toMatchObject({ available: false, tool })
    }
    const nmapScan = await client.callTool({
      name: 'nmap_scan',
      arguments: {
        authorizationConfirmed: true,
        targets: ['example.com'],
        timeoutSeconds: 30,
      },
    })
    expect(nmapScan).toMatchObject({ isError: true })
    const nucleiScan = await client.callTool({
      name: 'nuclei_scan',
      arguments: {
        authorizationConfirmed: true,
        timeoutSeconds: 30,
        urls: ['https://example.com'],
      },
    })
    expect(nucleiScan).toMatchObject({ isError: true })

    await client.close()
    await server.close()
  })

  it('runs all installed local adapters with bounded normalized arguments', async () => {
    const executable = await fakeExecutable()
    vi.stubEnv('PRISM_NMAP_BIN', executable)
    vi.stubEnv('PRISM_NUCLEI_BIN', executable)
    vi.stubEnv('PRISM_MSFCONSOLE_BIN', executable)
    vi.stubEnv('PRISM_CURL_BIN', executable)

    const proxy = createServer((socket) => socket.end())
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    const address = proxy.address()
    if (address === null || typeof address === 'string') throw new Error('proxy did not listen')
    vi.stubEnv('PRISM_BURP_PROXY_HOST', 'localhost')
    vi.stubEnv('PRISM_BURP_PROXY_PORT', String(address.port))

    const { client, server } = await connectedClient()
    try {
      for (const name of ['nmap_status', 'nuclei_status', 'metasploit_status', 'burp_status']) {
        const result = await client.callTool({ name, arguments: {} })
        expect(result.isError).not.toBe(true)
        expect(result.structuredContent).toMatchObject({ available: true })
      }

      const nmap = await client.callTool({
        name: 'nmap_scan',
        arguments: {
          authorizationConfirmed: true,
          ports: '443,8000-8002',
          profile: 'service',
          targets: ['Example.COM', '192.0.2.1'],
          timeoutSeconds: 30,
        },
      })
      expect(nmap.structuredContent).toMatchObject({
        ok: true,
        ports: '443,8000-8002',
        profile: 'service',
        targets: ['example.com', '192.0.2.1'],
      })

      const nuclei = await client.callTool({
        name: 'nuclei_scan',
        arguments: {
          authorizationConfirmed: true,
          rateLimit: 5,
          severities: ['high', 'high', 'critical'],
          tags: ['CVE', 'cve'],
          timeoutSeconds: 30,
          urls: ['https://Example.com/path#fragment'],
        },
      })
      expect(nuclei.structuredContent).toMatchObject({
        ok: true,
        severities: ['high', 'critical'],
        tags: ['cve'],
        urls: ['https://example.com/path'],
      })

      const search = await client.callTool({
        name: 'metasploit_search',
        arguments: { query: 'type:auxiliary apache' },
      })
      expect(search.structuredContent).toMatchObject({ ok: true, query: 'type:auxiliary apache' })
      const info = await client.callTool({
        name: 'metasploit_module_info',
        arguments: { module: 'AUXILIARY/scanner/http/example' },
      })
      expect(info.structuredContent).toMatchObject({
        module: 'auxiliary/scanner/http/example',
        ok: true,
      })
      const check = await client.callTool({
        name: 'metasploit_check',
        arguments: {
          authorizationConfirmed: true,
          module: 'exploit/test/example',
          rhost: 'Example.com',
          rport: 443,
          ssl: true,
          targetUri: '/admin',
          timeoutSeconds: 30,
        },
      })
      expect(check.structuredContent).toMatchObject({
        module: 'exploit/test/example',
        ok: true,
        rhost: 'example.com',
      })

      const burp = await client.callTool({
        name: 'burp_proxy_request',
        arguments: {
          allowInsecureTls: true,
          authorizationConfirmed: true,
          method: 'HEAD',
          timeoutSeconds: 5,
          url: 'https://example.com/check#ignored',
        },
      })
      expect(burp.structuredContent).toMatchObject({
        method: 'HEAD',
        ok: true,
        url: 'https://example.com/check',
      })
    } finally {
      await client.close()
      await server.close()
      await new Promise<void>((resolve, reject) =>
        proxy.close((error) => (error === undefined ? resolve() : reject(error))),
      )
    }
  })

  it('rejects invalid adapter input and unavailable or unsafe local endpoints', async () => {
    const executable = await fakeExecutable()
    vi.stubEnv('PRISM_NMAP_BIN', executable)
    vi.stubEnv('PRISM_NUCLEI_BIN', executable)
    vi.stubEnv('PRISM_MSFCONSOLE_BIN', executable)
    vi.stubEnv('PRISM_CURL_BIN', executable)
    vi.stubEnv('PRISM_BURP_PROXY_HOST', '192.0.2.20')
    vi.stubEnv('PRISM_BURP_PROXY_PORT', 'not-a-port')
    const { client, server } = await connectedClient()
    try {
      const calls = [
        client.callTool({
          name: 'nmap_scan',
          arguments: {
            authorizationConfirmed: true,
            targets: ['example.com;whoami'],
            timeoutSeconds: 30,
          },
        }),
        client.callTool({
          name: 'nuclei_scan',
          arguments: {
            authorizationConfirmed: true,
            tags: ['bad;tag'],
            timeoutSeconds: 30,
            urls: ['https://example.com'],
          },
        }),
        client.callTool({
          name: 'metasploit_search',
          arguments: { query: 'apache; exit' },
        }),
        client.callTool({
          name: 'metasploit_module_info',
          arguments: { module: 'exploit/test;run' },
        }),
        client.callTool({
          name: 'metasploit_check',
          arguments: {
            authorizationConfirmed: true,
            module: 'exploit/test/example',
            rhost: 'bad host',
          },
        }),
        client.callTool({
          name: 'burp_proxy_request',
          arguments: { authorizationConfirmed: true, url: 'https://example.com' },
        }),
      ]
      const results = await Promise.all(calls)
      expect(results.every((result) => result.isError === true)).toBe(true)
      expect(results.at(-1)?.structuredContent).toMatchObject({ proxyHost: '192.0.2.20' })
    } finally {
      await client.close()
      await server.close()
    }
  })
})

describe('local command runtime', () => {
  it('captures bounded output without a shell', async () => {
    const result = await runLocalCommand({
      args: ['-e', 'process.stdout.write("ready")'],
      command: process.execPath,
      timeoutMs: 5_000,
    })
    expect(result).toMatchObject({ exitCode: 0, stdout: 'ready', timedOut: false })
  })

  it('terminates commands that exceed their time budget', async () => {
    const result = await runLocalCommand({
      args: ['-e', 'setInterval(() => {}, 1000)'],
      command: process.execPath,
      timeoutMs: 50,
    })
    expect(result.timedOut).toBe(true)
  })

  it('resolves configured executables and returns bounded failure details', async () => {
    vi.stubEnv('PRISM_TEST_BIN', '  custom-tool  ')
    expect(configuredBinary('PRISM_TEST_BIN', 'fallback')).toBe('custom-tool')
    vi.stubEnv('PRISM_TEST_BIN', '   ')
    expect(configuredBinary('PRISM_TEST_BIN', 'fallback')).toBe('fallback')
    expect(await resolveExecutable(process.execPath)).toBe(process.execPath)
    expect(await resolveExecutable('./not-allowed')).toBeUndefined()

    const truncated = await runLocalCommand({
      args: [
        '-e',
        'process.stdout.write("abcdef"); process.stderr.write("\\u001b[31merror\\u001b[0m")',
      ],
      command: process.execPath,
      maxOutputBytes: 8,
      timeoutMs: 5_000,
    })
    expect(truncated).toMatchObject({ exitCode: 0, stdout: 'abcdef', truncated: true })

    const missing = await runLocalCommand({
      args: [],
      command: '/missing/prism-command-test',
      timeoutMs: 5_000,
    })
    expect(missing).toMatchObject({ exitCode: null, timedOut: false })
    expect(commandToolResult('test', missing).isError).toBe(true)
    expect(unavailableToolResult('Test', 'missing').structuredContent).toMatchObject({
      available: false,
      command: 'missing',
    })
  })
})

describe('security tool argument validation', () => {
  it('accepts bounded targets and ports', () => {
    expect(normalizeHostTarget('Example.COM')).toBe('example.com')
    expect(normalizeHostTarget('192.0.2.0/24')).toBe('192.0.2.0/24')
    expect(normalizeHttpUrl('https://example.com/path#fragment')).toBe('https://example.com/path')
    expect(normalizePorts('80,443,8000-8100')).toBe('80,443,8000-8100')
  })

  it('rejects command and console injection characters', () => {
    expect(() => normalizeHostTarget('example.com;whoami')).toThrow()
    expect(() => normalizePorts('80;whoami')).toThrow()
    expect(() => normalizeMetasploitModule('exploit/test;run')).toThrow()
    expect(() => normalizeMetasploitQuery('apache; exit')).toThrow()
    expect(() => normalizeTargetUri('/; run')).toThrow()
    expect(() => normalizeNucleiTag('cve;run')).toThrow()
  })

  it('handles IP, CIDR, URL, port, module, query, URI, and tag boundaries', () => {
    expect(normalizeHostTarget('2001:db8::1')).toBe('2001:db8::1')
    expect(normalizeHostTarget('2001:db8::/64')).toBe('2001:db8::/64')
    expect(normalizeMetasploitModule('EXPLOIT/test_module')).toBe('exploit/test_module')
    expect(normalizeMetasploitQuery('CVE-2026 type:exploit')).toBe('CVE-2026 type:exploit')
    expect(normalizeTargetUri('/path/to/item')).toBe('/path/to/item')
    expect(normalizeNucleiTag('CVE_2026')).toBe('cve_2026')
    for (const invalid of ['', '192.0.2.0/33', '2001:db8::/129', 'bad_domain']) {
      expect(() => normalizeHostTarget(invalid)).toThrow()
    }
    for (const invalid of ['ftp://example.com', 'https://user:pass@example.com']) {
      expect(() => normalizeHttpUrl(invalid)).toThrow()
    }
    for (const invalid of ['', '0', '443-80', '65536', '80-90-100']) {
      expect(() => normalizePorts(invalid)).toThrow()
    }
  })
})
