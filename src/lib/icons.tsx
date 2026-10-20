import { BRANDS, type BrandKey } from './brands'
import type { Icon } from '@phosphor-icons/react'
import {
  ArrowsSplit,
  Bell,
  CalendarCheck,
  CheckCircle,
  Clock,
  Cloud,
  Database,
  Envelope,
  Eye,
  Faders,
  FileText,
  Flag,
  Gauge,
  GearSix,
  Globe,
  Handshake,
  Headset,
  Lightning,
  ListChecks,
  Lock,
  MagnifyingGlass,
  Network,
  NotePencil,
  Phone,
  Question,
  Robot,
  ShieldCheck,
  Siren,
  Stack,
  Terminal,
  Ticket,
  UsersThree,
  Warning,
  Wrench,
  ChatsCircle,
  Broadcast,
  GitBranch,
  GitMerge,
  Rocket,
  Package,
  Pulse,
  ChartLine,
  Cube,
  Lifebuoy,
  ArrowCounterClockwise,
  Bug,
  Flask,
  Hammer,
} from '@phosphor-icons/react'

// Phosphor, light weight, everywhere. One family keeps the stroke consistent.
export const ICONS = {
  bell: Bell,
  siren: Siren,
  headset: Headset,
  phone: Phone,
  network: Network,
  globe: Globe,
  cloud: Cloud,
  database: Database,
  terminal: Terminal,
  magnifier: MagnifyingGlass,
  eye: Eye,
  stack: Stack,
  wrench: Wrench,
  gear: GearSix,
  notepad: NotePencil,
  file: FileText,
  checklist: ListChecks,
  chat: ChatsCircle,
  users: UsersThree,
  handshake: Handshake,
  ticket: Ticket,
  broadcast: Broadcast,
  envelope: Envelope,
  question: Question,
  split: ArrowsSplit,
  gauge: Gauge,
  clock: Clock,
  calendar: CalendarCheck,
  robot: Robot,
  faders: Faders,
  lightning: Lightning,
  shield: ShieldCheck,
  branch: GitBranch,
  merge: GitMerge,
  rocket: Rocket,
  package: Package,
  pulse: Pulse,
  chart: ChartLine,
  cube: Cube,
  lifebuoy: Lifebuoy,
  rollback: ArrowCounterClockwise,
  bug: Bug,
  flask: Flask,
  hammer: Hammer,
  lock: Lock,
  warning: Warning,
  check: CheckCircle,
  flag: Flag,
} as const satisfies Record<string, Icon>

export type IconKey = keyof typeof ICONS
export const ICON_KEYS = Object.keys(ICONS) as IconKey[]

export function NodeIcon({
  name,
  brand,
  size = 16,
  className,
}: {
  name: IconKey
  brand?: BrandKey
  size?: number
  className?: string
}) {
  if (brand && BRANDS[brand]) {
    const b = BRANDS[brand]
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill={b.hex} aria-hidden="true" data-brand={brand}>
        <path d={b.path} />
      </svg>
    )
  }
  const Cmp = ICONS[name] ?? ICONS.gear
  return <Cmp size={size} weight="light" className={className} aria-hidden="true" />
}
