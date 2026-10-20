import { describe, expect, it } from 'vitest'
import { edgesForNodes } from './flows'

const E = (id: string, source: string, target: string) => ({ id, source, target })
const edges = [E('ab', 'a', 'b'), E('bc', 'b', 'c'), E('cd', 'c', 'd'), E('ce', 'c', 'e')]

describe('edgesForNodes', () => {
  it('takes connectors between selected steps', () => {
    expect(edgesForNodes(edges, ['a', 'b', 'c']).sort()).toEqual(['ab', 'bc'])
  })
  it('bridges a skipped step so one flow still results', () => {
    expect(edgesForNodes(edges, ['a', 'd']).sort()).toEqual(['ab', 'bc', 'cd'])
  })
  it('joins a lone step to the nearest selected one', () => {
    expect(edgesForNodes(edges, ['a', 'b', 'd']).sort()).toEqual(['ab', 'bc', 'cd'])
  })
  it('returns nothing for unconnected steps', () => {
    expect(edgesForNodes([E('x', 'p', 'q')], ['p', 'z'])).toEqual([])
  })
})
