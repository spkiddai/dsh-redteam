import { z } from 'zod'
import type { ScanMatch, ScanRule } from './native-scan-types.js'

const leaf = z
  .object({
    field: z.enum(['status', 'header', 'body', 'cookie', 'tls.valid', 'tls.days', 'tls.keyBits']),
    key: z
      .string()
      .regex(/^[a-z0-9-]{1,80}$/)
      .optional(),
    op: z.enum(['equals', 'contains', 'absent', 'lt']),
    value: z.union([z.string().max(300), z.number().finite(), z.boolean()]).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.field === 'header' || v.field === 'cookie') && !v.key)
      ctx.addIssue({ code: 'custom', message: 'header/cookie requires key' })
    if (v.op !== 'absent' && v.value === undefined)
      ctx.addIssue({ code: 'custom', message: 'comparison requires value' })
    if (
      (v.op === 'contains' && typeof v.value !== 'string') ||
      (v.op === 'lt' && typeof v.value !== 'number')
    )
      ctx.addIssue({ code: 'custom', message: 'invalid comparison type' })
  })
// Deliberately finite nesting and literal matching: no scripts, regex, shell or payload DSL.
const matchLevel = (depth: number): z.ZodType<ScanMatch> =>
  depth === 0
    ? leaf
    : z.union([
        leaf,
        z
          .object({
            all: z
              .array(matchLevel(depth - 1))
              .min(1)
              .max(8),
          })
          .strict(),
        z
          .object({
            any: z
              .array(matchLevel(depth - 1))
              .min(1)
              .max(8),
          })
          .strict(),
      ])
export const scanRuleSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
    version: z.number().int().min(1).max(1_000_000),
    title: z.string().trim().min(1).max(100),
    family: z.enum(['web', 'exposure', 'tls']),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    // Relative to the exact URL path supplied by the operator. Never escape that scope.
    path: z
      .string()
      .max(160)
      .regex(/^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]*$/)
      .refine((p) => !p.split('/').some((s) => s === '..' || s === '.')),
    match: matchLevel(3),
    evidence: z.string().trim().min(1).max(300),
    remediation: z.string().trim().min(1).max(600),
  })
  .strict()

const status: ScanMatch = { field: 'status', op: 'equals', value: 200 }
const html: ScanMatch = { field: 'header', key: 'content-type', op: 'contains', value: 'text/html' }
const headerMissing = (key: string): ScanMatch => ({ field: 'header', key, op: 'absent' })
const body = (value: string): ScanMatch => ({ field: 'body', op: 'contains', value })
const rule = (
  id: string,
  title: string,
  family: ScanRule['family'],
  severity: ScanRule['severity'],
  path: string,
  match: ScanMatch,
  evidence: string,
  remediation: string,
): ScanRule => ({
  id: `prism-${id}`,
  version: 1,
  title,
  family,
  severity,
  path,
  match,
  evidence,
  remediation,
})

export const BUILTIN_SCAN_RULES: ScanRule[] = [
  rule(
    'mime-sniffing',
    '缺少 MIME 嗅探防护',
    'web',
    'low',
    '',
    { all: [status, html, headerMissing('x-content-type-options')] },
    'HTML 响应缺少 X-Content-Type-Options。',
    '为 HTML 响应设置 X-Content-Type-Options: nosniff，并正确声明内容类型。',
  ),
  rule(
    'frame-policy',
    '缺少页面嵌入限制',
    'web',
    'low',
    '',
    {
      all: [
        status,
        html,
        headerMissing('x-frame-options'),
        headerMissing('content-security-policy'),
      ],
    },
    'HTML 响应同时缺少 X-Frame-Options 和 Content-Security-Policy；需要评估点击劫持风险。',
    '使用 CSP frame-ancestors 限制可信嵌入来源；根据业务要求设置 X-Frame-Options。',
  ),
  rule(
    'csp',
    '缺少内容安全策略',
    'web',
    'info',
    '',
    { all: [status, html, headerMissing('content-security-policy')] },
    'HTML 响应未声明 Content-Security-Policy；这是加固建议，不代表已确认 XSS。',
    '先以 Report-Only 验证策略，再限制脚本与资源加载来源。',
  ),
  rule(
    'hsts',
    'HTTPS 未启用 HSTS',
    'tls',
    'low',
    '',
    { all: [status, headerMissing('strict-transport-security')] },
    'HTTPS 响应缺少 Strict-Transport-Security。',
    '确认全站支持 HTTPS 后设置适当的 HSTS max-age。',
  ),
  rule(
    'cookie-httponly',
    'Cookie 缺少 HttpOnly',
    'web',
    'low',
    '',
    { field: 'cookie', key: 'httponly', op: 'absent' },
    '至少一个响应 Cookie 未设置 HttpOnly；需确认该 Cookie 是否承担会话认证。未保存 Cookie 值。',
    '对会话和认证 Cookie 设置 HttpOnly；需由脚本读取的非敏感 Cookie 可标记为接受风险。',
  ),
  rule(
    'cookie-secure',
    'HTTPS Cookie 缺少 Secure',
    'tls',
    'low',
    '',
    { field: 'cookie', key: 'secure', op: 'absent' },
    'HTTPS 响应中至少一个 Cookie 缺少 Secure。未保存 Cookie 值。',
    '为 HTTPS 会话 Cookie 设置 Secure。',
  ),
  rule(
    'cookie-samesite',
    'Cookie 缺少 SameSite',
    'web',
    'info',
    '',
    { field: 'cookie', key: 'samesite', op: 'absent' },
    '至少一个响应 Cookie 未显式设置 SameSite。未保存 Cookie 值。',
    '根据跨站业务需求设置 SameSite=Lax、Strict 或配合 Secure 的 None。',
  ),
  rule(
    'git-head',
    'Git 仓库元数据可公开读取',
    'exposure',
    'medium',
    '.git/HEAD',
    { all: [status, body('ref: refs/heads/')] },
    '目标 .git/HEAD 返回 200，且包含 Git 分支引用标记。未下载仓库。',
    '从 Web 根目录移除 .git，并在服务器层禁止访问版本控制目录。',
  ),
  rule(
    'svn-entries',
    'SVN 元数据可公开读取',
    'exposure',
    'medium',
    '.svn/entries',
    { all: [status, body('<?xml'), body('wc-entries')] },
    '目标 .svn/entries 返回 SVN 工作副本标记。',
    '移除部署目录中的版本控制元数据并禁止访问 .svn。',
  ),
  rule(
    'directory-list',
    '目录索引已开启',
    'exposure',
    'low',
    '',
    { all: [status, html, { any: [body('<title>Index of /'), body('<h1>Index of /')] }] },
    'HTML 响应包含常见 Web 目录索引标题。',
    '关闭 autoindex/目录浏览，确认公开文件均为预期发布内容。',
  ),
  rule(
    'phpinfo',
    'PHP 诊断页面公开暴露',
    'exposure',
    'medium',
    'phpinfo.php',
    { all: [status, body('PHP Version'), body('PHP License')] },
    'phpinfo.php 同时包含 PHP 版本和许可证诊断标记。未保存页面内容。',
    '删除生产环境的 phpinfo 诊断页面。',
  ),
  rule(
    'actuator-env',
    '应用环境管理端点公开暴露',
    'exposure',
    'high',
    'actuator/env',
    {
      all: [
        status,
        { field: 'header', key: 'content-type', op: 'contains', value: 'json' },
        body('"propertySources"'),
        body('"activeProfiles"'),
      ],
    },
    'actuator/env 无认证响应包含环境属性结构。未保存属性或秘密值。',
    '限制管理端点网络访问并启用认证；若存在明文秘密暴露，应轮换相关凭证。',
  ),
  rule(
    'prometheus',
    '监控指标端点公开可读',
    'exposure',
    'low',
    'metrics',
    { all: [status, body('# HELP '), body('# TYPE ')] },
    'metrics 无认证响应包含 Prometheus 指标格式。',
    '为内部监控端点设置访问控制；若为预期公开指标，可记录风险接受。',
  ),
  rule(
    'tls-invalid',
    'TLS 证书验证失败',
    'tls',
    'medium',
    '',
    { field: 'tls.valid', op: 'equals', value: false },
    '服务端证书未通过系统信任链或主机名验证。',
    '部署有效证书、完整中间证书链，并确保域名匹配。内部 CA 应配置正确的信任根。',
  ),
  rule(
    'tls-expired',
    'TLS 证书已过期',
    'tls',
    'high',
    '',
    { field: 'tls.days', op: 'lt', value: 0 },
    '服务端证书已超过有效期。',
    '更新证书并配置自动续期与到期告警。',
  ),
  rule(
    'tls-expiring',
    'TLS 证书即将过期',
    'tls',
    'low',
    '',
    { field: 'tls.days', op: 'lt', value: 30 },
    '服务端证书将在 30 天内到期或已经过期。',
    '在到期前更新证书并验证续期流程。',
  ),
  rule(
    'tls-rsa',
    'TLS RSA 公钥长度不足',
    'tls',
    'medium',
    '',
    { field: 'tls.keyBits', op: 'lt', value: 2048 },
    '服务端 RSA 证书公钥小于 2048 位。',
    '替换为至少 2048 位 RSA 或合适强度的椭圆曲线证书。',
  ),
]
