import type { AssetGraph, AssetGraphReportFormat, AssetNode } from './types.js'
import { assetGraphSummary } from './asset-graph.js'

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function markdownEscape(value: string): string {
  return value
    .replaceAll('`', '\\`')
    .replaceAll('|', '\\|')
    .replace(/[\r\n]+/gu, ' ')
}

function mermaidLabel(node: AssetNode): string {
  return node.label.replace(/["\r\n]/gu, ' ').slice(0, 80)
}

export function renderAssetGraphMarkdown(graph: AssetGraph): string {
  const summary = assetGraphSummary(graph)
  const lines = [
    '# dsh-redteam asset graph',
    '',
    `- Graph: \`${graph.id}\``,
    `- Seed: \`${markdownEscape(summary.seed.label)}\` (${summary.seed.type})`,
    `- Updated: ${graph.updatedAt}`,
    `- Nodes / edges / sources: ${summary.nodeCount} / ${summary.edgeCount} / ${summary.sourceCount}`,
    `- Remaining frontier: ${summary.frontierCount}`,
    '',
    '> Relationships are public-source observations, not ownership or security conclusions. Verify important edges against their cited sources.',
    '',
    '```mermaid',
    'graph LR',
  ]
  for (const node of graph.nodes.slice(0, 500)) {
    lines.push(`  ${node.id.replaceAll('-', '_')}["${mermaidLabel(node)}\\n${node.type}"]`)
  }
  const visible = new Set(graph.nodes.slice(0, 500).map((node) => node.id))
  for (const edge of graph.edges.slice(0, 1_500)) {
    if (!visible.has(edge.from) || !visible.has(edge.to)) continue
    lines.push(
      `  ${edge.from.replaceAll('-', '_')} -->|${edge.relation}| ${edge.to.replaceAll('-', '_')}`,
    )
  }
  lines.push('```', '', '## Assets', '')
  lines.push(
    '| Type | Asset | Depth | Confidence | Expanded | Sources |',
    '|---|---|---:|---|---|---|',
  )
  for (const node of graph.nodes) {
    lines.push(
      `| ${node.type} | ${markdownEscape(node.label)} | ${String(node.depth)} | ${node.confidence} | ${node.expanded ? 'yes' : 'no'} | ${node.sourceIds.map(markdownEscape).join('<br>')} |`,
    )
  }
  lines.push('', '## Relationships', '')
  lines.push('| From | Relation | To | Confidence | Sources |', '|---|---|---|---|---|')
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  for (const edge of graph.edges) {
    lines.push(
      `| ${markdownEscape(byId.get(edge.from)?.label ?? edge.from)} | ${edge.relation} | ${markdownEscape(byId.get(edge.to)?.label ?? edge.to)} | ${edge.confidence} | ${edge.sourceIds.map(markdownEscape).join('<br>')} |`,
    )
  }
  lines.push('', '## Sources', '')
  for (const source of graph.sources) {
    lines.push(
      `- **${source.id}** — [${markdownEscape(source.title ?? source.url)}](${source.url}) — ${source.observedAt}${source.excerpt === undefined ? '' : ` — ${markdownEscape(source.excerpt)}`}`,
    )
  }
  return `${lines.join('\n')}\n`
}

export function renderAssetGraphGraphml(graph: AssetGraph): string {
  const nodes = graph.nodes
    .map(
      (node) => `    <node id="${xmlEscape(node.id)}">
      <data key="type">${node.type}</data><data key="label">${xmlEscape(node.label)}</data><data key="value">${xmlEscape(node.value)}</data><data key="depth">${String(node.depth)}</data><data key="confidence">${node.confidence}</data><data key="source_ids">${xmlEscape(node.sourceIds.join(','))}</data>
    </node>`,
    )
    .join('\n')
  const edges = graph.edges
    .map(
      (edge) =>
        `    <edge id="${xmlEscape(edge.id)}" source="${xmlEscape(edge.from)}" target="${xmlEscape(edge.to)}"><data key="relation">${edge.relation}</data><data key="confidence">${edge.confidence}</data><data key="source_ids">${xmlEscape(edge.sourceIds.join(','))}</data></edge>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="type" for="node" attr.name="type" attr.type="string"/><key id="label" for="node" attr.name="label" attr.type="string"/><key id="value" for="node" attr.name="value" attr.type="string"/><key id="depth" for="node" attr.name="depth" attr.type="int"/><key id="confidence" for="all" attr.name="confidence" attr.type="string"/><key id="relation" for="edge" attr.name="relation" attr.type="string"/><key id="source_ids" for="all" attr.name="source_ids" attr.type="string"/><key id="citations" for="graph" attr.name="citations_json" attr.type="string"/>
  <graph id="${xmlEscape(graph.id)}" edgedefault="directed">
    <data key="citations">${xmlEscape(JSON.stringify(graph.sources))}</data>
${nodes}
${edges}
  </graph>
</graphml>
`
}

export function renderAssetGraphHtml(graph: AssetGraph): string {
  const summary = assetGraphSummary(graph)
  const shownNodes = graph.nodes.slice(0, 500)
  const byDepth = new Map<number, AssetNode[]>()
  for (const node of shownNodes) {
    const row = byDepth.get(node.depth) ?? []
    row.push(node)
    byDepth.set(node.depth, row)
  }
  const width = 1_400
  const height = Math.max(360, (graph.maxDepth + 1) * 190)
  const positions = new Map<string, { x: number; y: number }>()
  for (const [depth, nodes] of byDepth) {
    nodes.forEach((node, index) => {
      positions.set(node.id, {
        x: ((index + 1) * width) / (nodes.length + 1),
        y: 90 + depth * 180,
      })
    })
  }
  const edges = graph.edges
    .slice(0, 1_500)
    .map((edge) => {
      const from = positions.get(edge.from)
      const to = positions.get(edge.to)
      if (from === undefined || to === undefined) return ''
      return `<g><line x1="${String(from.x)}" y1="${String(from.y)}" x2="${String(to.x)}" y2="${String(to.y)}"/><title>${xmlEscape(edge.relation)}</title></g>`
    })
    .join('')
  const nodes = shownNodes
    .map((node) => {
      const position = positions.get(node.id)
      if (position === undefined) return ''
      return `<g class="node node-${node.type}" transform="translate(${String(position.x)} ${String(position.y)})"><circle r="28"/><text y="4">${xmlEscape(node.type.slice(0, 3).toUpperCase())}</text><text class="label" y="48">${xmlEscape(node.label.slice(0, 28))}</text><title>${xmlEscape(`${node.type}: ${node.value}`)}</title></g>`
    })
    .join('')
  const sourceRows = graph.sources
    .map(
      (source) =>
        `<li><code>${xmlEscape(source.id)}</code> — <a href="${xmlEscape(source.url)}" rel="noreferrer">${xmlEscape(source.title ?? source.url)}</a>${source.excerpt === undefined ? '' : `<p>${xmlEscape(source.excerpt)}</p>`}</li>`,
    )
    .join('')
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const relationshipRows = graph.edges
    .map(
      (edge) =>
        `<tr><td>${xmlEscape(byId.get(edge.from)?.label ?? edge.from)}</td><td>${xmlEscape(edge.relation)}</td><td>${xmlEscape(byId.get(edge.to)?.label ?? edge.to)}</td><td>${edge.confidence}</td><td><code>${xmlEscape(edge.sourceIds.join(', '))}</code></td></tr>`,
    )
    .join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dsh-redteam asset graph</title><style>
body{margin:0;padding:28px;color:#202124;background:#f6f7f9;font:14px/1.5 system-ui,sans-serif}header,.panel{max-width:1400px;margin:0 auto 18px;padding:20px;border:1px solid #dde0e5;border-radius:14px;background:#fff}.metrics{display:flex;gap:24px;flex-wrap:wrap}.metrics strong{display:block;font-size:24px}.canvas,.table-wrap{overflow:auto}svg{min-width:1000px;background:#fbfcfd;border-radius:10px}line{stroke:#a8adb5;stroke-width:1.4}.node circle{fill:#fff;stroke:#6b94ef;stroke-width:2}.node text{text-anchor:middle;font-size:10px;font-weight:700}.node .label{font-size:11px;font-weight:500}.node-domain circle,.node-url circle{stroke:#2563eb}.node-ip circle,.node-network circle,.node-asn circle{stroke:#7c3aed}.node-technology circle{stroke:#059669}.node-infrastructure circle{stroke:#4e70a3}.node-supplier circle{stroke:#a56a00}a{color:#175cd3}li p{margin:3px 0 10px;color:#60646c}code{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}
</style></head><body><header><h1>dsh-redteam asset graph</h1><p><strong>Seed:</strong> ${xmlEscape(summary.seed.label)} · <code>${xmlEscape(graph.id)}</code></p><div class="metrics"><div><strong>${String(summary.nodeCount)}</strong>assets</div><div><strong>${String(summary.edgeCount)}</strong>relationships</div><div><strong>${String(summary.sourceCount)}</strong>sources</div><div><strong>${String(summary.frontierCount)}</strong>frontier</div></div><p>Public-source observations only. Verify important relationships against their cited sources.</p></header><section class="panel canvas"><svg viewBox="0 0 ${String(width)} ${String(height)}" role="img" aria-label="Asset relationship graph">${edges}${nodes}</svg>${graph.nodes.length > shownNodes.length ? `<p>Visualization shows the first ${String(shownNodes.length)} of ${String(graph.nodes.length)} nodes; JSON and GraphML exports retain the complete graph.</p>` : ''}</section><section class="panel table-wrap"><h2>Relationships</h2><table><thead><tr><th>From</th><th>Relation</th><th>To</th><th>Confidence</th><th>Sources</th></tr></thead><tbody>${relationshipRows}</tbody></table></section><section class="panel"><h2>Sources</h2><ol>${sourceRows}</ol></section></body></html>\n`
}

export function renderAssetGraph(graph: AssetGraph, format: AssetGraphReportFormat): string {
  if (format === 'html') return renderAssetGraphHtml(graph)
  if (format === 'markdown') return renderAssetGraphMarkdown(graph)
  if (format === 'graphml') return renderAssetGraphGraphml(graph)
  return `${JSON.stringify(graph, undefined, 2)}\n`
}
