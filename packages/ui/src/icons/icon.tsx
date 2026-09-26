import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Box,
  Calendar,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleSlash,
  CircleX,
  Clock,
  Command,
  Copy,
  Cpu,
  Database,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode,
  FileText,
  Filter,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  Globe,
  GripVertical,
  HardDrive,
  History,
  House,
  Info,
  KeyRound,
  Keyboard,
  Layers,
  LayoutGrid,
  Link,
  LoaderCircle,
  Lock,
  Maximize2,
  MemoryStick,
  Minimize2,
  Minus,
  Monitor,
  Moon,
  MoonStar,
  Move,
  Network,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  Settings,
  Shield,
  Sparkles,
  Square,
  Sun,
  Terminal,
  Trash2,
  TriangleAlert,
  Unlink,
  Unlock,
  Upload,
  User,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * The icon vocabulary. An explicit allowlist keeps bundles small and the visual
 * language controlled: adding an icon is a reviewed change to this map.
 */
export const ICONS = {
  activity: Activity,
  "arrow-down-to-line": ArrowDownToLine,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  bell: Bell,
  box: Box,
  calendar: Calendar,
  chart: ChartNoAxesColumn,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevrons-up-down": ChevronsUpDown,
  "circle-alert": CircleAlert,
  "circle-check": CircleCheck,
  "circle-help": CircleHelp,
  "circle-slash": CircleSlash,
  "circle-x": CircleX,
  clock: Clock,
  command: Command,
  copy: Copy,
  cpu: Cpu,
  database: Database,
  download: Download,
  ellipsis: Ellipsis,
  "ellipsis-vertical": EllipsisVertical,
  "external-link": ExternalLink,
  eye: Eye,
  "eye-off": EyeOff,
  "file-code": FileCode,
  "file-text": FileText,
  filter: Filter,
  folder: Folder,
  "git-branch": GitBranch,
  "git-commit": GitCommitHorizontal,
  globe: Globe,
  "grip-vertical": GripVertical,
  "hard-drive": HardDrive,
  history: History,
  home: House,
  info: Info,
  "key-round": KeyRound,
  keyboard: Keyboard,
  layers: Layers,
  "layout-grid": LayoutGrid,
  link: Link,
  loader: LoaderCircle,
  lock: Lock,
  "maximize-2": Maximize2,
  "memory-stick": MemoryStick,
  "minimize-2": Minimize2,
  minus: Minus,
  monitor: Monitor,
  moon: Moon,
  "moon-star": MoonStar,
  move: Move,
  network: Network,
  pause: Pause,
  pencil: Pencil,
  pin: Pin,
  play: Play,
  plus: Plus,
  "refresh-cw": RefreshCw,
  "rotate-cw": RotateCw,
  search: Search,
  server: Server,
  settings: Settings,
  shield: Shield,
  sparkles: Sparkles,
  square: Square,
  sun: Sun,
  terminal: Terminal,
  "trash-2": Trash2,
  "triangle-alert": TriangleAlert,
  unlink: Unlink,
  unlock: Unlock,
  upload: Upload,
  user: User,
  users: Users,
  x: X,
  zap: Zap,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export type IconSize = 12 | 14 | 16 | 20;

export interface IconProps {
  name: IconName;
  /** 14 inside small controls and meta, 16 in body and md controls, 20 in rail and headers. */
  size?: IconSize;
  className?: string;
  /**
   * Accessible name. Omit for decorative icons next to text (the default:
   * aria-hidden). Only set it when the icon is the sole content that conveys
   * meaning and there is no surrounding label.
   */
  label?: string;
}

/**
 * A Lucide icon in the Signal style: 1.5 px stroke that does not scale with
 * size, square caps and mitred joins for the instrument-panel look.
 */
export function Icon({ name, size = 16, className, label }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      strokeWidth={1.5}
      nonScalingStroke
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      role={label === undefined ? undefined : "img"}
      focusable="false"
      data-icon={name}
    />
  );
}
