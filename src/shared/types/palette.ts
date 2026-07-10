export interface PaletteItem {
  id: number
  instrumentKey: string | null
  label: string
  shape: 'rect' | 'circle'
  color: string
  category: string
  isBuiltin: boolean
  isHidden: boolean
  sortOrder: number
}
