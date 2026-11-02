import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assetGraphFrontier,
  assetGraphSummary,
  createAssetGraph,
  inferAssetType,
  mergeAssetObservations,
} from '../src/lib/asset-graph.js'
import { AssetGraphStore } from '../src/lib/asset-graph-store.js'
import {
  renderAssetGraph,
  renderAssetGraphGraphml,
  renderAssetGraphHtml,
  renderAssetGraphMarkdown,
} from '../src/lib/asset-graph-report.js'
import type { AssetGraph, AssetObservation, AssetRef } from '../src/lib/types.js'

const temporaryDirectories: string[] = []
const limits = { maxEdges: 20, maxNodes: 20, maxSources: 20 }

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

function graph(): AssetGraph {
  return createAssetGraph(
    '/workspace',
    { label: 'Example Corp', type: 'organization', value: '  Example   Corp  ' },
    3,
    new Date('2026-08-22T00:00:00.000Z'),
  )
}

function observation(overrides: Partial<AssetObservation> = {}): AssetObservation {
  return {
    confidence: 'medium',
    object: { label: 'Example Cloud', type: 'product', value: 'Example Cloud' },
    relation: 'produces',
    source: {
      excerpt: 'Example Corp announced Example Cloud.',
      observedAt: '2026-08-22T01:00:00.000Z',
      title: 'Product announcement',
      url: 'https://example.com/news/cloud#announcement',
    },
    subject: { type: 'organization', value: 'Example Corp' },
    ...overrides,
  }
}

describe('asset graph domain', () => {
  it('infers common seed types without network access', () => {
    expect(inferAssetType('203.0.113.10')).toBe('ip')
    expect(inferAssetType('203.0.113.0/24')).toBe('network')
    expect(inferAssetType('2001:db8::/32')).toBe('network')
    expect(inferAssetType('https://example.com/path')).toBe('url')
    expect(inferAssetType('Example.COM.')).toBe('domain')
    expect(inferAssetType('as64500')).toBe('asn')
    expect(inferAssetType('Example Corp')).toBe('organization')
  })

  it('creates a seed, merges sourced relations, deduplicates evidence, and advances the frontier', () => {
    const source = graph()
    expect(source.nodes[0]).toMatchObject({ depth: 0, label: 'Example Corp', expanded: false })
    const first = mergeAssetObservations(
      source,
      [observation()],
      [{ type: 'organization', value: 'Example Corp' }],
      limits,
      new Date('2026-08-22T02:00:00.000Z'),
    )
    expect(assetGraphSummary(first)).toMatchObject({
      domainCounts: { registrable: 0, subdomain: 0, unclassified: 0 },
      edgeCount: 1,
      frontierCount: 1,
      ipCounts: { ipv4: 0, ipv6: 0 },
      nodeCount: 2,
      sourceCount: 1,
      typeCounts: { organization: 1, product: 1 },
    })
    expect(first.nodes.find((node) => node.type === 'product')).toMatchObject({ depth: 1 })
    expect(assetGraphFrontier(first, 10).frontier.map((node) => node.type)).toEqual(['product'])

    const second = mergeAssetObservations(first, [observation({ confidence: 'high' })], [], limits)
    expect(second.edges).toHaveLength(1)
    expect(second.sources).toHaveLength(1)
    expect(second.edges[0]).toMatchObject({ confidence: 'high' })
    expect(first.edges[0]).toMatchObject({ confidence: 'medium' })
  })

  it('records sourced node-only observations and normalizes network assets', () => {
    const source = graph()
    const base = observation()
    const nodeOnly: AssetObservation = {
      confidence: base.confidence,
      source: base.source,
      subject: base.subject,
    }
    const companyOnly = mergeAssetObservations(source, [nodeOnly], [], limits)
    expect(companyOnly.nodes[0]?.sourceIds).toHaveLength(1)

    const domain = createAssetGraph('/workspace', { type: 'domain', value: 'Example.COM.' }, 2)
    expect(domain.nodes[0]?.value).toBe('example.com')
    const ip = createAssetGraph('/workspace', { type: 'ip', value: '2001:db8::1' }, 2)
    expect(ip.nodes[0]?.type).toBe('ip')
    const network = createAssetGraph('/workspace', { type: 'network', value: '2001:DB8::/032' }, 2)
    expect(network.nodes[0]?.value).toBe('2001:db8::/32')
    const url = createAssetGraph('/workspace', { type: 'url', value: 'https://example.com/#x' }, 2)
    expect(url.nodes[0]?.value).toBe('https://example.com/')
    const asn = createAssetGraph('/workspace', { type: 'asn', value: 'as64500' }, 2)
    expect(asn.nodes[0]?.value).toBe('AS64500')
  })

  it('summarizes every stored asset by type, domain level, and IP version', () => {
    const source = createAssetGraph('/workspace', { type: 'domain', value: 'example.co.uk' }, 3)
    const objects: readonly AssetRef[] = [
      { type: 'domain', value: 'api.example.co.uk' },
      { type: 'ip', value: '203.0.113.10' },
      { type: 'ip', value: '2001:db8::10' },
      { type: 'network', value: '203.0.113.0/24' },
      { type: 'certificate', value: 'example certificate' },
      { type: 'product', value: 'Example API' },
      { type: 'technology', value: 'React' },
      { type: 'asn', value: 'AS64500' },
      { type: 'organization', value: 'Example Corp' },
    ]
    const updated = mergeAssetObservations(
      source,
      objects.map((object, index) => ({
        confidence: 'high' as const,
        object,
        relation: 'related_to' as const,
        source: { url: `https://example.co.uk/source/${String(index)}` },
        subject: { type: 'domain' as const, value: 'example.co.uk' },
      })),
      [],
      limits,
    )
    const summary = assetGraphSummary(updated)
    expect(summary.domainCounts).toEqual({ registrable: 1, subdomain: 1, unclassified: 0 })
    expect(summary.ipCounts).toEqual({ ipv4: 1, ipv6: 1 })
    expect(summary.typeCounts).toEqual({
      asn: 1,
      certificate: 1,
      domain: 2,
      infrastructure: 0,
      ip: 2,
      network: 1,
      organization: 1,
      product: 1,
      supplier: 0,
      technology: 1,
      url: 0,
    })
    expect(Object.values(summary.typeCounts).reduce((total, count) => total + count, 0)).toBe(
      summary.nodeCount,
    )
  })

  it('rejects unsourced, malformed, out-of-depth, and over-budget observations', () => {
    const source = graph()
    const base = observation()
    const missingRelation: AssetObservation = {
      confidence: base.confidence,
      object: base.object!,
      source: base.source,
      subject: base.subject,
    }
    const missingObject: AssetObservation = {
      confidence: base.confidence,
      relation: base.relation!,
      source: base.source,
      subject: base.subject,
    }
    expect(() =>
      mergeAssetObservations(
        source,
        [observation({ subject: { type: 'organization', value: 'Unknown Corp' } })],
        [],
        limits,
      ),
    ).toThrow('subject is not in the graph')
    expect(() => mergeAssetObservations(source, [missingRelation], [], limits)).toThrow(
      'relation and object must be provided together',
    )
    expect(() => mergeAssetObservations(source, [missingObject], [], limits)).toThrow(
      'relation and object must be provided together',
    )
    expect(() =>
      mergeAssetObservations(
        source,
        [observation({ source: { url: 'file:///tmp/a' } })],
        [],
        limits,
      ),
    ).toThrow('must use http or https')
    expect(() =>
      mergeAssetObservations(source, [observation({ source: { url: 'not a url' } })], [], limits),
    ).toThrow('invalid asset source URL')
    expect(() =>
      mergeAssetObservations(
        source,
        [observation({ source: { url: 'https://user:pass@example.com/' } })],
        [],
        limits,
      ),
    ).toThrow('must not contain credentials')
    expect(() =>
      mergeAssetObservations(
        source,
        [observation({ source: { observedAt: 'not-a-date', url: 'https://example.com/' } })],
        [],
        limits,
      ),
    ).toThrow('invalid asset source observation time')
    expect(() =>
      mergeAssetObservations(source, [], [{ type: 'domain', value: 'missing.test' }], limits),
    ).toThrow('expanded asset is not in the graph')
    expect(() => createAssetGraph('/workspace', { type: 'ip', value: '999.999.1.1' }, 2)).toThrow(
      'invalid IP asset',
    )
    expect(() =>
      createAssetGraph('/workspace', { type: 'network', value: '203.0.113.0/99' }, 2),
    ).toThrow('invalid network asset')
    expect(() =>
      createAssetGraph('/workspace', { type: 'domain', value: 'not a domain' }, 2),
    ).toThrow('invalid domain asset')
    expect(() => createAssetGraph('/workspace', { type: 'asn', value: 'ASX' }, 2)).toThrow(
      'invalid ASN asset',
    )

    const one = mergeAssetObservations(source, [observation()], [], limits)
    const product = one.nodes.find((node) => node.type === 'product')!
    expect(() =>
      mergeAssetObservations(
        { ...one, maxDepth: 1 },
        [
          observation({
            object: { type: 'domain', value: 'example.com' },
            relation: 'uses_domain',
            subject: { type: product.type, value: product.value },
          }),
        ],
        [],
        limits,
      ),
    ).toThrow('exceeds graph max depth')
    expect(() =>
      mergeAssetObservations(source, [observation()], [], { ...limits, maxNodes: 1 }),
    ).toThrow('node limit exceeded')
    expect(() =>
      mergeAssetObservations(source, [observation()], [], { ...limits, maxEdges: 0 }),
    ).toThrow('edge limit exceeded')
    expect(() =>
      mergeAssetObservations(source, [observation()], [], { ...limits, maxSources: 0 }),
    ).toThrow('source limit exceeded')
    expect(() =>
      mergeAssetObservations(source, Array(101).fill(observation()), [], limits),
    ).toThrow('at most 100 asset observations')
    const expanded: AssetRef[] = Array.from({ length: 101 }, () => ({
      type: 'organization',
      value: 'Example Corp',
    }))
    expect(() => mergeAssetObservations(source, [], expanded, limits)).toThrow(
      'at most 100 expanded assets',
    )
  })

  it('redacts sensitive URL parameters and permits sourced back-edges to known nodes', () => {
    const first = mergeAssetObservations(
      graph(),
      [
        observation({
          source: { url: 'https://example.com/news?api_key=secret&view=public#result' },
        }),
      ],
      [],
      limits,
    )
    expect(first.sources[0]?.url).toBe(
      'https://example.com/news?api_key=%5Bredacted%5D&view=public',
    )
    const product = first.nodes.find((node) => node.type === 'product')!
    const backEdge = mergeAssetObservations(
      { ...first, maxDepth: 1 },
      [
        observation({
          object: { type: 'organization', value: 'Example Corp' },
          relation: 'related_to',
          subject: { type: product.type, value: product.value },
        }),
      ],
      [],
      limits,
    )
    expect(backEdge.edges).toHaveLength(2)
  })
})

describe('asset graph persistence and reports', () => {
  it('round-trips a graph and exports all supported formats', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-redteam-asset-graph-'))
    temporaryDirectories.push(root)
    const store = new AssetGraphStore(root)
    const value = mergeAssetObservations(graph(), [observation()], [], limits)
    await store.save(value)
    expect(await store.load(value.id)).toEqual(value)
    expect((await store.latest())?.id).toBe(value.id)
    await store.replace(value)

    expect(renderAssetGraphMarkdown(value)).toContain('```mermaid')
    expect(renderAssetGraphMarkdown(value)).toContain(value.sources[0]?.id)
    expect(renderAssetGraphHtml(value)).toContain('Asset relationship graph')
    expect(renderAssetGraphHtml(value)).toContain('<h2>Relationships</h2>')
    expect(renderAssetGraphGraphml(value)).toContain('<graphml')
    expect(renderAssetGraphGraphml(value)).toContain('citations_json')
    expect(JSON.parse(renderAssetGraph(value, 'json'))).toMatchObject({ id: value.id })
    for (const format of ['html', 'markdown', 'graphml', 'json'] as const) {
      const path = await store.writeReport(value.id, format, renderAssetGraph(value, format))
      expect((await readFile(path)).length).toBeGreaterThan(0)
    }
  })

  it('handles empty stores and rejects malformed identifiers and records', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-redteam-asset-empty-'))
    temporaryDirectories.push(root)
    const store = new AssetGraphStore(root)
    expect(await store.latest()).toBeUndefined()
    await expect(store.load('../escape')).rejects.toThrow('invalid asset graph id')
  })
})
