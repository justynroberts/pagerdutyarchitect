type E = { id: string; source: string; target: string }

/** Shortest directed path (as edge ids) from `from` to the nearest node in `goals`, or null. */
function bridge(edges: E[], from: string, goals: Set<string>, forward: boolean): string[] | null {
  const seen = new Set([from])
  const queue: { id: string; path: string[] }[] = [{ id: from, path: [] }]
  while (queue.length) {
    const cur = queue.shift()!
    for (const e of edges) {
      const a = forward ? e.source : e.target
      const b = forward ? e.target : e.source
      if (a !== cur.id || seen.has(b)) continue
      const path = [...cur.path, e.id]
      if (goals.has(b)) return path
      seen.add(b)
      queue.push({ id: b, path })
    }
  }
  return null
}

/**
 * The connectors a flow through these steps should cover. Connectors running directly between
 * selected steps are taken as they are. A selected step left on its own is joined to the nearest
 * other selected step by the shortest route, so skipping a box in the middle still gives one flow.
 */
export function edgesForNodes(edges: E[], nodeIds: string[]): string[] {
  const sel = new Set(nodeIds)
  const out = new Set(edges.filter((e) => sel.has(e.source) && sel.has(e.target)).map((e) => e.id))
  const touched = new Set<string>()
  for (const e of edges) if (out.has(e.id)) (touched.add(e.source), touched.add(e.target))
  for (const id of nodeIds) {
    if (touched.has(id) || sel.size < 2) continue
    const goals = new Set(nodeIds.filter((n) => n !== id))
    const path = bridge(edges, id, goals, true) ?? bridge(edges, id, goals, false)
    if (path) path.forEach((p) => out.add(p))
  }
  return [...out]
}
