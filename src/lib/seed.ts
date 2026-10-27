import type { CatalogItem, Flow, Zone, DwellEdge, DwellNode, EdgeData, NodeData, Presence } from '../types'
import { handlesFor } from './layout'
import { arrange } from './arrange'

const item = (
  id: string,
  kind: CatalogItem['kind'],
  label: string,
  tool: string,
  icon: CatalogItem['icon'],
  current: number,
  future: number,
  presence: Presence = 'both',
  extra: Pick<CatalogItem, 'brand' | 'category' | 'lever'> = {},
): CatalogItem => ({ id, kind, label, tool, icon, current, future, presence, category: 'Incident', ...extra })

const mon = (id: string, label: string, tool: string, icon: CatalogItem['icon'], brand?: CatalogItem['brand']): CatalogItem =>
  item(id, 'input', label, tool, icon, 2, 0.5, 'both', { brand, category: 'Monitoring' })
const ci = (
  id: string,
  kind: CatalogItem['kind'],
  label: string,
  tool: string,
  icon: CatalogItem['icon'],
  current: number,
  future: number,
  brand?: CatalogItem['brand'],
  presence: Presence = 'both',
): CatalogItem => item(id, kind, label, tool, icon, current, future, presence, { brand, category: 'CI/CD' })

/** A PagerDuty capability: its function's icon on a PagerDuty tile, added by the platform in Future. */
const pd = (
  id: string,
  kind: CatalogItem['kind'],
  label: string,
  tool: string,
  icon: CatalogItem['icon'],
  future: number,
  lever: CatalogItem['lever'],
  current = 0,
  presence: Presence = 'future-only',
): CatalogItem => item(id, kind, label, tool, icon, current, future, presence, { brand: 'pagerduty', category: 'PagerDuty', lever })

/** Sample figures for incident handling. Every number is editable in the app. */
export const SEED_CATALOGUE: CatalogItem[] = [
  item('in-alert', 'input', 'Monitoring alert', 'Datadog, AppDynamics, Splunk', 'bell', 2, 0.5),
  item('in-contact', 'input', 'Customer contact', 'Genesys, customer portal', 'headset', 4, 2),
  item('in-network', 'input', 'Network event', 'Cisco, PRTG, ThousandEyes', 'network', 2, 0.5),

  item('st-triage', 'step', 'Triage alert', 'On-call engineer', 'magnifier', 14, 4),
  item('st-gather', 'step', 'Gather context across tools', 'Consoles, logs, dashboards', 'stack', 18, 2),
  item('st-fix', 'step', 'Carry out fix', 'Runbook', 'wrench', 18, 11),
  item('st-log', 'step', 'Log resolution notes', 'ServiceNow', 'notepad', 10, 1),
  item('st-post', 'step', 'Post to MS Teams', 'MS Teams', 'chat', 5, 0.5),
  item('st-approval', 'step', 'On-call rota approval', 'Change approval', 'handshake', 22, 6),
  item('st-chg', 'step', 'Raise change ticket', 'ServiceNow CHG', 'ticket', 15, 2),
  item('st-channel', 'step', 'Open collaboration channel', 'MS Teams', 'users', 8, 1),
  item('st-status', 'step', 'Update status page', 'Status page', 'broadcast', 8, 1),
  item('st-notify', 'step', 'Notify stakeholders', 'SMS, email', 'envelope', 10, 1),
  item('st-repair', 'step', 'Triage and repair', 'Resolver group', 'gear', 45, 28),

  item('de-quick', 'decision', 'Quick fix?', 'On-call engineer', 'question', 1, 0.5),
  item('de-severity', 'decision', 'Impact and severity?', 'On-call engineer', 'gauge', 4, 0.5),
  item('de-hours', 'decision', 'Out of hours?', 'Rota', 'clock', 1, 0.5),
  item('de-change', 'decision', 'Change approval needed?', 'Change manager', 'split', 3, 0.5),

  // Handoffs, waits, records, systems and whole processes of their own
  item('ho-escalate', 'handoff', 'Escalate to next tier', 'Escalation policy', 'escalate', 12, 1),
  item('ho-vendor', 'handoff', 'Hand off to vendor', 'Vendor support', 'handover', 20, 8),
  item('ho-shift', 'handoff', 'Shift handover', 'Follow the sun', 'users', 15, 3),
  item('wa-vendor', 'wait', 'Wait for vendor response', 'Vendor support', 'hourglass', 60, 30),
  item('wa-window', 'wait', 'Wait for change window', 'Change calendar', 'calendar', 120, 30),
  item('wa-approval', 'wait', 'Wait for approver', 'Change manager', 'hourglass', 30, 5),
  item('do-ticket', 'document', 'Update incident ticket', 'ServiceNow', 'ticket', 8, 1),
  item('do-postmortem', 'document', 'Write postmortem', 'Confluence', 'book', 120, 30),
  item('do-report', 'document', 'Compliance report', 'Audit log', 'file', 30, 5),
  item('sy-cmdb', 'system', 'Look up CMDB', 'ServiceNow CMDB', 'database', 6, 1),
  item('sy-catalogue', 'system', 'Check service catalogue', 'Service directory', 'cube', 5, 0.5),
  item('sy-logs', 'system', 'Query log store', 'Log platform', 'database', 10, 2),
  item('sp-major', 'subprocess', 'Major incident process', 'MIM team', 'siren', 90, 40),
  item('sp-change', 'subprocess', 'Change management process', 'CAB', 'checklist', 60, 20),
  item('sp-problem', 'subprocess', 'Problem management', 'Problem manager', 'bug', 45, 20),

  // PagerDuty capabilities, by what each one does
  pd('au-signal', 'automation', 'Signal Intelligence grouping', 'Signal Intelligence', 'faders', 0.5, 'ai'),
  pd('pd-orchestration', 'automation', 'Event Orchestration', 'Route, enrich and suppress', 'flow', 0.5, 'automation'),
  pd('pd-aiops', 'automation', 'AIOps noise reduction', 'Alert grouping and suppression', 'funnel', 0.5, 'ai'),
  pd('pd-oncall', 'automation', 'Page the right on-call', 'Schedules and escalation policies', 'pager', 0.5, 'automation'),
  pd('pd-workflow', 'automation', 'Incident Workflow', 'Channels, roles, tasks', 'flow', 0.5, 'automation'),
  pd('au-paige', 'automation', 'Paige SRE Agent query', 'Paige, MCP and API', 'robot', 1.5, 'ai'),
  pd('pd-runbook', 'automation', 'Runbook Automation', 'Diagnostics and remediation', 'play', 2, 'automation'),
  pd('pd-advance', 'automation', 'PagerDuty Advance summary', 'Generative AI', 'sparkle', 0.5, 'ai'),
  pd('au-notify', 'automation', 'Automated stakeholder update', 'Status page, email', 'megaphone', 0.5, 'automation'),
  pd('pd-status', 'automation', 'Status Page update', 'PagerDuty Status Pages', 'broadcast', 0.5, 'automation'),
  pd('au-scribe', 'automation', 'Scribe writes the notes', 'Scribe', 'notepad', 0.5, 'ai'),
  pd('pd-postmortem', 'document', 'Postmortem draft', 'PagerDuty Advance', 'clipboard', 10, 'ai'),
  pd('pd-insights', 'output', 'Insights and analytics', 'PagerDuty Analytics', 'chart', 0, undefined),

  // Monitoring tools: each one is a source of alerts
  mon('mo-datadog', 'Datadog monitor alert', 'Datadog', 'pulse', 'datadog'),
  mon('mo-splunk', 'Splunk alert', 'Splunk', 'chart', 'splunk'),
  mon('mo-dynatrace', 'Dynatrace problem', 'Dynatrace', 'pulse', 'dynatrace'),
  mon('mo-newrelic', 'New Relic alert', 'New Relic', 'chart', 'newrelic'),
  mon('mo-grafana', 'Grafana alert', 'Grafana', 'chart', 'grafana'),
  mon('mo-prom', 'Alertmanager alert', 'Prometheus', 'bell', 'prometheus'),
  mon('mo-elastic', 'Elastic alert', 'Elastic', 'magnifier', 'elastic'),
  mon('mo-sentry', 'Sentry issue', 'Sentry', 'bug', 'sentry'),
  mon('mo-appd', 'AppDynamics health rule', 'AppDynamics', 'gauge'),
  mon('mo-cw', 'CloudWatch alarm', 'Amazon CloudWatch', 'cloud'),
  mon('mo-te', 'ThousandEyes alert', 'ThousandEyes', 'network'),
  mon('mo-prtg', 'PRTG sensor down', 'PRTG', 'network'),
  mon('mo-otel', 'OpenTelemetry signal', 'OpenTelemetry', 'pulse', 'opentelemetry'),

  // CI/CD pipelines
  ci('ci-gha', 'input', 'GitHub Actions run fails', 'GitHub Actions', 'branch', 2, 0.5, 'githubactions'),
  ci('ci-gl', 'input', 'GitLab pipeline fails', 'GitLab CI', 'branch', 2, 0.5, 'gitlab'),
  ci('ci-jenkins', 'input', 'Jenkins build fails', 'Jenkins', 'hammer', 2, 0.5, 'jenkins'),
  ci('ci-circle', 'input', 'CircleCI job fails', 'CircleCI', 'branch', 2, 0.5, 'circleci'),
  ci('ci-commit', 'input', 'Commit merged', 'GitHub', 'merge', 1, 0.5, 'github'),
  ci('ci-build', 'step', 'Build image', 'Docker', 'package', 12, 6, 'docker'),
  ci('ci-test', 'step', 'Run test suite', 'CI runner', 'flask', 18, 9),
  ci('ci-scan', 'step', 'Security scan', 'Snyk', 'shield', 10, 3, 'snyk'),
  ci('ci-plan', 'step', 'Plan infrastructure', 'Terraform', 'cube', 8, 3, 'terraform'),
  ci('ci-deploy', 'step', 'Deploy to cluster', 'Kubernetes', 'rocket', 15, 4, 'kubernetes'),
  ci('ci-gitops', 'step', 'Sync with Argo CD', 'Argo CD', 'merge', 10, 2, 'argo'),
  ci('ci-helm', 'step', 'Helm release', 'Helm', 'package', 9, 3, 'helm'),
  ci('ci-gate', 'step', 'Release approval gate', 'Change manager', 'handshake', 30, 8),
  ci('ci-rollback', 'step', 'Roll back release', 'Argo CD', 'rollback', 20, 3, 'argo'),
  ci('ci-testok', 'decision', 'Tests pass?', 'CI runner', 'question', 1, 0.5),
  ci('ci-canary', 'decision', 'Canary healthy?', 'Datadog', 'gauge', 6, 1, 'datadog'),
  ci('ci-live', 'output', 'Released to production', '', 'rocket', 0, 0),

  item('ou-resolved', 'output', 'Incident resolved', '', 'check', 0, 0),
  item('ou-informed', 'output', 'Stakeholders informed', '', 'flag', 0, 0),
]

const byId = (id: string) => {
  const found = SEED_CATALOGUE.find((c) => c.id === id)
  if (!found) throw new Error(`Unknown catalogue item ${id}`)
  return found
}

type NodeSpec = [id: string, catalogueId: string, share: number, note?: string, overrides?: Partial<NodeData>]

const LEVERS: Record<string, NodeData['lever']> = {
  signal: 'ai',
  triage: 'ai',
  gather: 'ai',
  paige: 'ai',
  log: 'ai',
  quick: 'ai',
  severity: 'ai',
  post: 'automation',
  approval: 'automation',
  chg: 'automation',
  channel: 'automation',
  status: 'automation',
  notify: 'automation',
}

const NODE_SPECS: NodeSpec[] = [
  ['alert', 'in-alert', 70, 'Raised by the monitors behind the MCP and API layer.'],
  ['contact', 'in-contact', 30],
  ['signal', 'au-signal', 100, 'Groups related alerts so one incident is one page.'],
  ['triage', 'st-triage', 100, 'DXP triage by the on-call engineer.'],
  ['gather', 'st-gather', 100, 'Jumping between consoles to assemble the picture. Paige does this in one query.'],
  ['paige', 'au-paige', 100, 'Returns impact, size, criticality, threshold and whether the fix is a quick one.'],
  ['quick', 'de-quick', 100],
  ['fix', 'st-fix', 35],
  ['log', 'st-log', 35, 'Resolution notes captured at the point of the fix.'],
  ['severity', 'de-severity', 65],
  ['post', 'st-post', 25],
  ['hours', 'de-hours', 40],
  ['approval', 'st-approval', 15],
  ['chg', 'st-chg', 40],
  ['channel', 'st-channel', 40],
  ['status', 'st-status', 40],
  ['notify', 'st-notify', 40],
  ['repair', 'st-repair', 40],
  ['done', 'ou-resolved', 100],
]

type EdgeSpec = [from: string, to: string, label?: string, presence?: Presence]

const EDGE_SPECS: EdgeSpec[] = [
  ['alert', 'triage', '', 'current-only'],
  ['alert', 'signal', '', 'future-only'],
  ['signal', 'triage', '', 'future-only'],
  ['contact', 'triage'],
  ['triage', 'gather'],
  ['gather', 'quick'],
  ['triage', 'paige', '', 'future-only'],
  ['paige', 'quick', '', 'future-only'],
  ['quick', 'fix', 'Yes'],
  ['quick', 'severity', 'No'],
  ['fix', 'log'],
  ['log', 'done'],
  ['severity', 'post', 'Low'],
  ['severity', 'hours', 'High'],
  ['post', 'done'],
  ['hours', 'approval', 'Yes'],
  ['hours', 'chg', 'No'],
  ['approval', 'chg'],
  ['chg', 'channel'],
  ['chg', 'status'],
  ['chg', 'notify'],
  ['channel', 'repair'],
  ['status', 'repair'],
  ['notify', 'repair'],
  ['repair', 'done'],
]

export function nodeFromItem(c: CatalogItem, id: string, position: { x: number; y: number }, share = 100, note = ''): DwellNode {
  return {
    id,
    type: 'flow',
    position,
    data: {
      kind: c.kind,
      label: c.label,
      tool: c.tool,
      icon: c.icon,
      brand: c.brand,
      current: c.current,
      future: c.future,
      share,
      presence: c.presence,
      note,
      lever: c.lever,
    },
  }
}

export const SAMPLE_ZONES: Zone[] = []

export const SAMPLE_FLOWS: Flow[] = [
  { id: 'f-quick', name: 'Quick fix path', color: '#2fbf71' },
  { id: 'f-major', name: 'High severity, out of hours', color: '#f5a623' },
]

const FLOW_EDGES: Record<string, string[]> = {
  'f-quick': ['alert-triage', 'triage-gather', 'gather-quick', 'triage-paige', 'paige-quick', 'quick-fix', 'fix-log', 'log-done', 'alert-signal', 'signal-triage'],
  'f-major': ['quick-severity', 'severity-hours', 'hours-chg', 'hours-approval', 'approval-chg', 'chg-channel', 'chg-status', 'chg-notify', 'channel-repair', 'status-repair', 'notify-repair', 'repair-done'],
}

export function buildSample(): { nodes: DwellNode[]; edges: DwellEdge[] } {
  const nodes = NODE_SPECS.map(([id, cid, share, note]) => {
    const n = nodeFromItem(byId(cid), `n-${id}`, { x: 0, y: 0 }, share, note ?? '')
    return { ...n, data: { ...n.data, lever: LEVERS[id] ?? n.data.lever } }
  })
  const { sourceHandle, targetHandle } = handlesFor('LR')
  const edges: DwellEdge[] = EDGE_SPECS.map(([from, to, label = '', presence = 'both']) => ({
    id: `e-${from}-${to}`,
    type: 'flow',
    source: `n-${from}`,
    target: `n-${to}`,
    sourceHandle,
    targetHandle,
    data: {
      presence,
      label,
      flows: Object.keys(FLOW_EDGES).filter((f) => FLOW_EDGES[f].includes(`${from}-${to}`)),
    } satisfies EdgeData,
  }))
  return arrange(nodes, edges, 'LR')
}

export const SAMPLE_TITLE = 'Alert engagement, sample figures'
