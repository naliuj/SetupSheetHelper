import { NEW_FOLDER_VALUE, NO_FOLDER_VALUE } from '@renderer/state/useFolderPicker'
import { indentedFolderLabel, type FolderPickerOption } from '@renderer/state/folderTree'

interface Props {
  folderOptions: FolderPickerOption[]
  selection: string
  onChangeSelection: (value: string) => void
  newFolderName: string
  onChangeNewFolderName: (value: string) => void
}

/** The <select> + inline "new folder name" input, shared by any dialog that files into a folder. */
export default function FolderPickerFields({
  folderOptions,
  selection,
  onChangeSelection,
  newFolderName,
  onChangeNewFolderName
}: Props): JSX.Element {
  return (
    <>
      <div className="inline-form">
        <select value={selection} onChange={(e) => onChangeSelection(e.target.value)}>
          <option value={NO_FOLDER_VALUE}>No folder</option>
          {folderOptions.map(({ folder, depth }) => (
            <option key={folder.id} value={folder.id}>
              {indentedFolderLabel(folder.name, depth)}
            </option>
          ))}
          <option value={NEW_FOLDER_VALUE}>+ Create new folder…</option>
        </select>
      </div>
      {selection === NEW_FOLDER_VALUE && (
        <div className="inline-form">
          <input
            placeholder="New folder name"
            value={newFolderName}
            onChange={(e) => onChangeNewFolderName(e.target.value)}
            autoFocus
          />
        </div>
      )}
    </>
  )
}
