import { useEffect, useState } from 'react'
import type { Folder } from '@shared/types/setup'
import { buildFolderTree, flattenFolderTreeForPicker, type FolderPickerOption } from './folderTree'

export const NEW_FOLDER_VALUE = '__new_folder__'
export const NO_FOLDER_VALUE = ''

/** Shared folder-selection state for any dialog that files something into an optional folder.
 *  New folders created from this picker always land at the top level — nested creation
 *  happens via the Manage modal's "+ New Subfolder" action instead. */
export function useFolderPicker(): {
  folderOptions: FolderPickerOption[]
  selection: string
  setSelection: (value: string) => void
  newFolderName: string
  setNewFolderName: (value: string) => void
  resolveFolderId: () => Promise<number | null>
} {
  const [folderOptions, setFolderOptions] = useState<FolderPickerOption[]>([])
  const [selection, setSelection] = useState(NO_FOLDER_VALUE)
  const [newFolderName, setNewFolderName] = useState('')

  useEffect(() => {
    window.api.folders.list().then((folders) => setFolderOptions(flattenFolderTreeForPicker(buildFolderTree(folders))))
  }, [])

  async function resolveFolderId(): Promise<number | null> {
    if (selection === NEW_FOLDER_VALUE) {
      if (!newFolderName.trim()) return null
      const folder = await window.api.folders.create(newFolderName.trim(), null)
      return folder.id
    }
    if (selection === NO_FOLDER_VALUE) return null
    return Number(selection)
  }

  return { folderOptions, selection, setSelection, newFolderName, setNewFolderName, resolveFolderId }
}
