import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Folder } from '@shared/types/setup'
import type { HomeLayout } from '@shared/constants/homeLayout'
import BlocksLayout from './BlocksLayout'
import TreeLayout from './TreeLayout'
import TwoPaneLayout from './TwoPaneLayout'
import MillerColumnsLayout from './MillerColumnsLayout'

/** One clickable thing on the home screen (a studio, a template, or a saved setup), normalized so
 *  every layout renders it the same way regardless of what it is. */
export interface HomeEntry {
  /** Unique within a section, e.g. "studio-3" / "template-5" / "setup-2". */
  id: string
  kind: 'studio' | 'template' | 'setup' | 'multiSetup'
  folderId: number | null
  label: string
  /** Secondary line — "Studio", "Gear list", a session date, etc. */
  meta?: string
  /** Small label — currently only marks an entry as being a Multi Setup rather than a lone setup. */
  badge?: string
  /** Lucide icon component shown before the label. */
  icon?: LucideIcon
  onActivate: () => void
  /** Optional extra action (e.g. a studio's "Edit inventory"). */
  secondaryAction?: { label: string; onClick: () => void }
}

/** Props every layout view receives. Section chrome (title + headerAction) lives in HomeSection. */
export interface HomeLayoutViewProps {
  folders: Folder[]
  entries: HomeEntry[]
  selectedFolderId: number | null
  onSelectFolder: (folderId: number | null) => void
  emptyMessage?: ReactNode
}

interface Props extends HomeLayoutViewProps {
  title: string
  layout: HomeLayout
  headerAction?: ReactNode
}

/** Renders a home section (studios/templates or saved setups) in the user's chosen layout. Shared
 *  header (title + Manage/New buttons); the body is delegated to the active layout component. */
export default function HomeSection({ title, layout, headerAction, ...view }: Props): JSX.Element {
  const View =
    layout === 'tree'
      ? TreeLayout
      : layout === 'twoPane'
        ? TwoPaneLayout
        : layout === 'miller'
          ? MillerColumnsLayout
          : BlocksLayout

  return (
    <div>
      <div
        className="section-title"
        style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>{title}</span>
        {headerAction}
      </div>
      <View {...view} />
    </div>
  )
}
