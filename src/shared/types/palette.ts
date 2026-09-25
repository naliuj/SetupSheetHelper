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
  /** Optional default placed size for the layout block when dragged onto a floor plan — null falls
   *  back to layoutStore.addBlock's standard square default. Only set for blocks that read better at
   *  a non-square size (e.g. the gobo, a long thin bar). */
  defaultWidth: number | null
  defaultHeight: number | null
  /** Default label text color, copied onto a block when it is dropped from the palette. null =
   *  Auto. Like the rest of the item it is a starting point: the placed block keeps no link back. */
  labelColor: string | null
}
