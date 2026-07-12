import { useCallback, useEffect, useState } from 'react'
import type { Folder, FolderScope } from '@shared/types/setup'

/** Folder-selection state for a dialog that files something into an optional folder within one
 *  scope ('studio' | 'setup'). Pairs with the FolderPicker component: this owns the scoped folder
 *  list + selection, FolderPicker renders it. Folders created here are stamped with `scope` and
 *  land at the top level. */
export function useFolderPicker(scope: FolderScope): {
  folders: Folder[]
  selectedFolderId: number | null
  setSelectedFolderId: (id: number | null) => void
  createFolder: (name: string, parentFolderId: number | null) => Promise<Folder>
} {
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)

  useEffect(() => {
    window.api.folders.list(scope).then(setFolders)
  }, [scope])

  const createFolder = useCallback(
    async (name: string, parentFolderId: number | null): Promise<Folder> => {
      const folder = await window.api.folders.create(name, parentFolderId, scope)
      setFolders((prev) => [...prev, folder])
      return folder
    },
    [scope]
  )

  return { folders, selectedFolderId, setSelectedFolderId, createFolder }
}
