import { strToU8, zipSync } from 'fflate'
import type { Assessment, FindingSeverity, FindingStatus, ReportFormat } from './types.js'

const SEVERITY_ORDER: readonly FindingSeverity[] = ['critical', 'high', 'medium', 'low']
const STATUS_ORDER: readonly FindingStatus[] = ['candidate', 'confirmed', 'accepted', 'fixed']

function markdownEscape(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('`', '\\`')
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function severityCounts(assessment: Assessment): Record<FindingSeverity, number> {
  return Object.fromEntries(
    SEVERITY_ORDER.map((severity) => [
      severity,
      assessment.findings.filter((finding) => finding.severity === severity).length,
    ]),
  ) as Record<FindingSeverity, number>
}

function statusCounts(assessment: Assessment): Record<FindingStatus, number> {
  return Object.fromEntries(
    STATUS_ORDER.map((status) => [
      status,
      assessment.findings.filter((finding) => finding.status === status).length,
    ]),
  ) as Record<FindingStatus, number>
}

export function renderMarkdown(assessment: Assessment): string {
  const counts = severityCounts(assessment)
  const statuses = statusCounts(assessment)
  const lines = [
    '# dsh-redteam assessment report',
    '',
    `- Assessment: \`${assessment.id}\``,
    `- Mode: \`${assessment.mode}\``,
    `- Scan root: \`${markdownEscape(assessment.scanRoot)}\``,
    `- Completed: ${assessment.completedAt}`,
    `- Files scanned: ${assessment.filesScanned}`,
    `- Findings: ${assessment.findings.length}`,
    `- Severity: critical ${String(counts.critical)}, high ${String(counts.high)}, medium ${String(counts.medium)}, low ${String(counts.low)}`,
    `- Workflow: candidate ${String(statuses.candidate)}, confirmed ${String(statuses.confirmed)}, accepted ${String(statuses.accepted)}, fixed ${String(statuses.fixed)}`,
    '',
    '> Findings are candidates until a human or an authorized verification confirms them.',
    '',
  ]

  for (const severity of SEVERITY_ORDER) {
    const findings = assessment.findings.filter((finding) => finding.severity === severity)
    if (findings.length === 0) continue
    lines.push(`## ${severity.toUpperCase()}`, '')
    for (const finding of findings) {
      lines.push(
        `### ${markdownEscape(finding.title)}`,
        '',
        `- ID: \`${finding.id}\``,
        `- Rule: \`${finding.ruleId}\``,
        `- CWE: \`${finding.cwe}\``,
        `- Confidence: \`${finding.confidence}\``,
        `- Status: \`${finding.status}\``,
        `- Location: \`${markdownEscape(finding.location.path)}:${finding.location.line}:${finding.location.column}\``,
        '',
        '**Redacted evidence**',
        '',
        '```text',
        finding.evidence.replaceAll('```', '``\u200b`'),
        '```',
        '',
        '**Remediation**',
        '',
        finding.remediation,
        '',
      )
      const latest = finding.statusHistory?.at(-1)
      if (latest !== undefined) {
        lines.push(
          '**Latest review decision**',
          '',
          `${latest.changedAt}: \`${latest.from}\` → \`${latest.to}\` — ${markdownEscape(latest.reason)}`,
          '',
        )
      }
    }
  }
  return `${lines.join('\n')}\n`
}

export function renderJson(assessment: Assessment): string {
  return `${JSON.stringify(assessment, undefined, 2)}\n`
}

export function renderHtml(assessment: Assessment): string {
  const counts = severityCounts(assessment)
  const statuses = statusCounts(assessment)
  const findings = assessment.findings
    .map(
      (finding) => `<article class="finding severity-${finding.severity}">
  <header><span>${xmlEscape(finding.severity.toUpperCase())}</span><h2>${xmlEscape(finding.title)}</h2></header>
  <dl>
    <div><dt>ID</dt><dd>${xmlEscape(finding.id)}</dd></div>
    <div><dt>Rule / CWE</dt><dd>${xmlEscape(finding.ruleId)} / ${xmlEscape(finding.cwe)}</dd></div>
    <div><dt>Confidence / Status</dt><dd>${xmlEscape(finding.confidence)} / ${xmlEscape(finding.status)}</dd></div>
    <div><dt>Location</dt><dd>${xmlEscape(`${finding.location.path}:${String(finding.location.line)}:${String(finding.location.column)}`)}</dd></div>
  </dl>
  <h3>Redacted evidence</h3><pre>${xmlEscape(finding.evidence)}</pre>
  <h3>Remediation</h3><p>${xmlEscape(finding.remediation)}</p>${
    finding.statusHistory?.at(-1) === undefined
      ? ''
      : `
  <h3>Latest review decision</h3><p>${xmlEscape(finding.statusHistory.at(-1)!.changedAt)}: ${xmlEscape(finding.statusHistory.at(-1)!.reason)}</p>`
  }
</article>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dsh-redteam assessment report</title>
<style>body{max-width:960px;margin:0 auto;padding:40px 24px;color:#202124;background:#f7f8fa;font:14px/1.6 system-ui,sans-serif}h1{margin:0}.meta,.finding{margin-top:20px;padding:20px;border:1px solid #dde0e5;border-radius:12px;background:#fff}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:20px}.summary div{padding:14px;border-radius:10px;background:#fff;text-align:center}.summary strong{display:block;font-size:24px}.finding header{display:flex;align-items:center;gap:10px}.finding header span{padding:2px 7px;border-radius:999px;color:#9f2334;background:#fae7ea;font-size:11px;font-weight:700}.finding h2{margin:0;font-size:18px}.finding h3{margin-bottom:4px;font-size:13px}dl{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}dl div{min-width:0}dt{color:#74777d;font-size:11px}dd{margin:0;overflow-wrap:anywhere}pre{overflow:auto;padding:12px;border-radius:8px;background:#f2f3f5;white-space:pre-wrap}.notice{padding-left:12px;border-left:3px solid #d32f3e;color:#55585e}@media(max-width:620px){.summary,dl{grid-template-columns:1fr 1fr}}</style></head>
<body><h1>dsh-redteam assessment report</h1><p class="notice">Findings are candidates until a human or an authorized verification confirms them.</p>
<section class="meta"><strong>Assessment:</strong> ${xmlEscape(assessment.id)}<br><strong>Scan root:</strong> ${xmlEscape(assessment.scanRoot)}<br><strong>Completed:</strong> ${xmlEscape(assessment.completedAt)}<br><strong>Files scanned:</strong> ${String(assessment.filesScanned)}</section>
<section class="summary">${SEVERITY_ORDER.map((severity) => `<div><strong>${String(counts[severity])}</strong>${severity.toUpperCase()}</div>`).join('')}</section>
<section class="meta"><strong>Workflow:</strong> ${STATUS_ORDER.map((status) => `${xmlEscape(status)} ${String(statuses[status])}`).join(' · ')}</section>
${findings || '<section class="finding"><p>No findings.</p></section>'}
</body></html>\n`
}

export function renderXml(assessment: Assessment): string {
  const findings = assessment.findings
    .map(
      (
        finding,
      ) => `    <finding id="${xmlEscape(finding.id)}" severity="${finding.severity}" status="${finding.status}">
      <title>${xmlEscape(finding.title)}</title>
      <rule>${xmlEscape(finding.ruleId)}</rule>
      <cwe>${xmlEscape(finding.cwe)}</cwe>
      <confidence>${finding.confidence}</confidence>
      <location path="${xmlEscape(finding.location.path)}" line="${String(finding.location.line)}" column="${String(finding.location.column)}" />
      <evidence>${xmlEscape(finding.evidence)}</evidence>
      <remediation>${xmlEscape(finding.remediation)}</remediation>
      <status-history>${(finding.statusHistory ?? [])
        .map(
          (change) => `
        <change from="${change.from}" to="${change.to}" at="${xmlEscape(change.changedAt)}">${xmlEscape(change.reason)}</change>`,
        )
        .join('')}
      </status-history>
    </finding>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<assessment-report schema-version="1">
  <assessment id="${xmlEscape(assessment.id)}" mode="${assessment.mode}">
    <scan-root>${xmlEscape(assessment.scanRoot)}</scan-root>
    <completed-at>${xmlEscape(assessment.completedAt)}</completed-at>
    <files-scanned>${String(assessment.filesScanned)}</files-scanned>
    <finding-count>${String(assessment.findings.length)}</finding-count>
  </assessment>
  <notice>Findings are candidates until a human or an authorized verification confirms them.</notice>
  <findings>
${findings}
  </findings>
</assessment-report>\n`
}

function wordParagraph(text: string, style?: 'Heading1' | 'Heading2' | 'Title'): string {
  const paragraphStyle = style === undefined ? '' : `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`
  return `<w:p>${paragraphStyle}<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`
}

export function renderWord(assessment: Assessment): Uint8Array {
  const paragraphs = [
    wordParagraph('dsh-redteam assessment report', 'Title'),
    wordParagraph(
      'Findings are candidates until a human or an authorized verification confirms them.',
    ),
    wordParagraph(`Assessment: ${assessment.id}`),
    wordParagraph(`Scan root: ${assessment.scanRoot}`),
    wordParagraph(`Completed: ${assessment.completedAt}`),
    wordParagraph(`Files scanned: ${String(assessment.filesScanned)}`),
    wordParagraph(`Findings: ${String(assessment.findings.length)}`),
  ]
  for (const severity of SEVERITY_ORDER) {
    const findings = assessment.findings.filter((finding) => finding.severity === severity)
    if (findings.length === 0) continue
    paragraphs.push(wordParagraph(severity.toUpperCase(), 'Heading1'))
    for (const finding of findings) {
      paragraphs.push(
        wordParagraph(finding.title, 'Heading2'),
        wordParagraph(`ID: ${finding.id}`),
        wordParagraph(`Rule / CWE: ${finding.ruleId} / ${finding.cwe}`),
        wordParagraph(`Confidence / Status: ${finding.confidence} / ${finding.status}`),
        wordParagraph(
          `Location: ${finding.location.path}:${String(finding.location.line)}:${String(finding.location.column)}`,
        ),
        wordParagraph(`Redacted evidence: ${finding.evidence}`),
        wordParagraph(`Remediation: ${finding.remediation}`),
      )
      const latest = finding.statusHistory?.at(-1)
      if (latest !== undefined) {
        paragraphs.push(
          wordParagraph(
            `Latest review: ${latest.changedAt}, ${latest.from} -> ${latest.to}, ${latest.reason}`,
          ),
        )
      }
    }
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`
  const documentRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>dsh-redteam assessment report</dc:title><dc:creator>dsh-redteam</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(assessment.completedAt)}</dcterms:created></cp:coreProperties>`
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>dsh-redteam</Application></Properties>`
  return zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(relationships),
      'docProps/app.xml': strToU8(app),
      'docProps/core.xml': strToU8(core),
      'word/_rels/document.xml.rels': strToU8(documentRelationships),
      'word/document.xml': strToU8(document),
      'word/styles.xml': strToU8(styles),
    },
    { level: 6 },
  )
}

export function renderSarif(assessment: Assessment): string {
  const rules = [
    ...new Map(assessment.findings.map((finding) => [finding.ruleId, finding])).values(),
  ]
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        results: assessment.findings.map((finding) => ({
          level:
            finding.severity === 'critical' || finding.severity === 'high'
              ? 'error'
              : finding.severity === 'medium'
                ? 'warning'
                : 'note',
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.location.path },
                region: {
                  startColumn: finding.location.column,
                  startLine: finding.location.line,
                },
              },
            },
          ],
          message: { text: `${finding.title}: ${finding.evidence}` },
          properties: {
            status: finding.status,
            ...(finding.ruleVersion === undefined ? {} : { ruleVersion: finding.ruleVersion }),
          },
          ruleId: finding.ruleId,
        })),
        tool: {
          driver: {
            informationUri: 'https://github.com/deepseek-ai/deepseek-harness',
            name: 'dsh-redteam',
            rules: rules.map((finding) => ({
              defaultConfiguration: {
                level:
                  finding.severity === 'critical' || finding.severity === 'high'
                    ? 'error'
                    : finding.severity === 'medium'
                      ? 'warning'
                      : 'note',
              },
              fullDescription: { text: finding.remediation },
              id: finding.ruleId,
              name: finding.title,
              properties: { tags: [finding.cwe, finding.category] },
            })),
            version: '1.3.2',
          },
        },
      },
    ],
    version: '2.1.0',
  }
  return `${JSON.stringify(sarif, undefined, 2)}\n`
}

export function renderReport(assessment: Assessment, format: ReportFormat): string | Uint8Array {
  if (format === 'html') return renderHtml(assessment)
  if (format === 'markdown') return renderMarkdown(assessment)
  if (format === 'sarif') return renderSarif(assessment)
  if (format === 'word') return renderWord(assessment)
  if (format === 'xml') return renderXml(assessment)
  return renderJson(assessment)
}
