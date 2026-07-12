interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

/** A flat on/off toggle switch used for boolean settings (Berklee features, Dark mode, Colored
 *  rows, etc.). Replaces the native checkbox at settings-style sites; multi-select field lists use
 *  chips and dense/list contexts keep the custom checkbox. */
export default function ToggleSwitch({ checked, onChange, label, disabled }: Props): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="toggle-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-track">
        <span className="toggle-knob" />
      </span>
      {label}
    </button>
  )
}
