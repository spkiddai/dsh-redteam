import { describe, expect, it, vi } from 'vitest'
import { detectBuiltInToolAvailability } from '../src/lib/tool-availability.js'

function accessFor(paths: readonly string[]) {
  const available = new Set(paths)
  return vi.fn(async (path: string) => {
    if (!available.has(path)) throw new Error('missing')
  })
}

describe('built-in tool availability', () => {
  it('uses the current process environment when no probe options are supplied', async () => {
    const result = await detectBuiltInToolAvailability()

    expect(result.map((tool) => tool.id)).toEqual(['nmap', 'burp-suite', 'metasploit', 'nuclei'])
    expect(result.every((tool) => typeof tool.installed === 'boolean')).toBe(true)
  })

  it('honors configured binaries, PATH tools, and macOS Burp applications', async () => {
    const checkAccess = accessFor([
      '/custom/nmap',
      '/bin/custom-msf',
      '/opt/bin/nuclei',
      '/Applications/Burp Suite Professional.app',
    ])

    await expect(
      detectBuiltInToolAvailability({
        access: checkAccess,
        environment: {
          PATH: '/bin:/opt/bin',
          PRISM_MSFCONSOLE_BIN: 'custom-msf',
          PRISM_NMAP_BIN: '/custom/nmap',
          PRISM_NUCLEI_BIN: '   ',
        },
        platform: 'darwin',
      }),
    ).resolves.toEqual([
      { id: 'nmap', installed: true },
      { id: 'burp-suite', installed: true },
      { id: 'metasploit', installed: true },
      { id: 'nuclei', installed: true },
    ])
    expect(checkAccess).toHaveBeenCalledWith('/custom/nmap', expect.any(Number))
    expect(checkAccess).toHaveBeenCalledWith(
      '/Applications/Burp Suite Professional.app',
      expect.any(Number),
    )
  })

  it('reports missing tools and treats an invalid configured path as authoritative', async () => {
    const checkAccess = accessFor(['/bin/nmap'])

    await expect(
      detectBuiltInToolAvailability({
        access: checkAccess,
        environment: { PATH: '/bin', PRISM_NMAP_BIN: 'nested/nmap' },
        platform: 'linux',
      }),
    ).resolves.toEqual([
      { id: 'nmap', installed: false },
      { id: 'burp-suite', installed: false },
      { id: 'metasploit', installed: false },
      { id: 'nuclei', installed: false },
    ])
    expect(checkAccess).not.toHaveBeenCalledWith('/bin/nmap', expect.any(Number))
  })

  it('uses PATHEXT while probing Windows PATH entries', async () => {
    const checkAccess = accessFor(['D:\\Bin\\nmap.EXE', 'C:\\Tools\\burp.CMD'])
    const result = await detectBuiltInToolAvailability({
      access: checkAccess,
      environment: { PATH: 'C:\\Tools;D:\\Bin', PATHEXT: '.EXE;.CMD' },
      platform: 'win32',
    })

    expect(result).toEqual([
      { id: 'nmap', installed: true },
      { id: 'burp-suite', installed: true },
      { id: 'metasploit', installed: false },
      { id: 'nuclei', installed: false },
    ])
  })
})
