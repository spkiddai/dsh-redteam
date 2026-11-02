import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024

export interface LocalCommandResult {
  readonly command: string
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly stderr: string
  readonly stdout: string
  readonly timedOut: boolean
  readonly truncated: boolean
}

export interface LocalCommandSpec {
  readonly args: readonly string[]
  readonly command: string
  readonly maxOutputBytes?: number
  readonly timeoutMs: number
}

function executableCandidates(command: string): string[] {
  if (isAbsolute(command)) return [command]
  if (command.includes('/') || command.includes('\\')) return []
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter((entry) => entry !== '')
  if (process.platform !== 'win32') return pathEntries.map((entry) => join(entry, command))
  const extensions = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter((extension) => extension !== '')
  return pathEntries.flatMap((entry) =>
    extensions.map((extension) => join(entry, command + extension)),
  )
}

export async function resolveExecutable(command: string): Promise<string | undefined> {
  for (const candidate of executableCandidates(command)) {
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // Keep searching PATH candidates.
    }
  }
  return undefined
}

export function configuredBinary(environmentName: string, fallback: string): string {
  const configured = process.env[environmentName]?.trim()
  return configured === undefined || configured === '' ? fallback : configured
}

export async function runLocalCommand(spec: LocalCommandSpec): Promise<LocalCommandResult> {
  const maxOutputBytes = spec.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  return await new Promise((resolve) => {
    const child = spawn(spec.command, [...spec.args], {
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    let stdout = ''
    let stderr = ''
    let capturedBytes = 0
    let truncated = false
    let timedOut = false
    let settled = false

    const capture = (chunk: Buffer, decoder: StringDecoder, stream: 'stderr' | 'stdout'): void => {
      const remaining = Math.max(0, maxOutputBytes - capturedBytes)
      if (remaining === 0) {
        truncated = true
        return
      }
      const accepted = chunk.subarray(0, remaining)
      capturedBytes += accepted.byteLength
      if (accepted.byteLength < chunk.byteLength) truncated = true
      const text = decoder.write(accepted)
      if (stream === 'stdout') stdout += text
      else stderr += text
    }

    child.stdout.on('data', (chunk: Buffer) => capture(chunk, stdoutDecoder, 'stdout'))
    child.stderr.on('data', (chunk: Buffer) => capture(chunk, stderrDecoder, 'stderr'))

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      stdout += stdoutDecoder.end()
      stderr += stderrDecoder.end()
      resolve({
        command: spec.command,
        exitCode,
        signal,
        stderr: stripAnsi(stderr).trim(),
        stdout: stripAnsi(stdout).trim(),
        timedOut,
        truncated,
      })
    }

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1_000).unref()
    }, spec.timeoutMs)
    timeout.unref()

    child.once('error', (error) => {
      stderr += error.message
      finish(null, null)
    })
    child.once('close', finish)
  })
}

function stripAnsi(value: string): string {
  return value.replace(new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'gu'), '')
}

export function jsonToolResult(
  payload: Readonly<Record<string, unknown>>,
  isError = false,
): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, undefined, 2) }],
    isError,
    structuredContent: { ...payload },
  }
}

export function unavailableToolResult(tool: string, command: string): CallToolResult {
  return jsonToolResult(
    {
      available: false,
      error: `${tool} 未安装或不在 PATH 中。请先在本机安装，或通过对应的 PRISM_*_BIN 环境变量指定可执行文件。`,
      command,
      tool,
    },
    true,
  )
}

export function commandToolResult(
  tool: string,
  result: LocalCommandResult,
  details: Readonly<Record<string, unknown>> = {},
): CallToolResult {
  const ok = result.exitCode === 0 && !result.timedOut
  return jsonToolResult(
    {
      ...details,
      command: result.command,
      exitCode: result.exitCode,
      ok,
      signal: result.signal,
      stderr: result.stderr,
      stdout: result.stdout,
      timedOut: result.timedOut,
      tool,
      truncated: result.truncated,
    },
    !ok,
  )
}
