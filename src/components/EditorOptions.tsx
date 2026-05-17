import { useRef, useState } from "react"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import { Settings } from "lucide-react"
import { Popover } from "./Popover"
import type {
  EditorOptions,
  SetEditorOption,
} from "../hooks/useEditorOptions"

interface EditorOptionsPanelProps {
  options: EditorOptions
  onSetOption: SetEditorOption
}

export const EditorOptionsPanel = ({
  options,
  onSetOption,
}: EditorOptionsPanelProps) => {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          ref={triggerRef}
          className="editor-footer-btn"
          aria-label={t`Editor options`}
          title={t`Editor options`}
        >
          <Settings size={13} />
        </button>
      }
      placement="top-end"
      offset={8}
    >
      <div className="editor-options">
        <label className="editor-options-item">
          <input
            type="checkbox"
            checked={options.showWords}
            onChange={(e) => onSetOption("showWords", e.target.checked)}
          />
          <Trans>Show word count</Trans>
        </label>
        <label className="editor-options-item">
          <input
            type="checkbox"
            checked={options.showChars}
            onChange={(e) => onSetOption("showChars", e.target.checked)}
          />
          <Trans>Show character count</Trans>
        </label>
        <div className="editor-options-divider" />
        <label className="editor-options-item">
          <input
            type="checkbox"
            checked={options.syncTitleStyle}
            onChange={(e) => onSetOption("syncTitleStyle", e.target.checked)}
          />
          <Trans>Sync title style</Trans>
        </label>
        <div className="editor-options-divider" />
        <label className="editor-options-item">
          <input
            type="checkbox"
            checked={options.spellcheck}
            onChange={(e) => onSetOption("spellcheck", e.target.checked)}
          />
          <Trans>Browser spellcheck</Trans>
        </label>
        <label className="editor-options-item">
          <input
            type="checkbox"
            checked={options.autocorrect}
            onChange={(e) => onSetOption("autocorrect", e.target.checked)}
          />
          <Trans>Browser autocorrect</Trans>
        </label>
      </div>
    </Popover>
  )
}
