import { useState } from "react"

export interface EditorOptions {
  showWords: boolean
  showChars: boolean
  spellcheck: boolean
  autocorrect: boolean
  syncTitleStyle: boolean
}

const DEFAULT_OPTIONS: EditorOptions = {
  showWords: true,
  showChars: true,
  spellcheck: false,
  autocorrect: false,
  syncTitleStyle: true,
}

const STORAGE_KEY = "ol-editor-options"

function loadOptions(): EditorOptions {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_OPTIONS, ...JSON.parse(stored) }
  } catch {
    // fall through to defaults if storage is unavailable or JSON is corrupt
  }
  return DEFAULT_OPTIONS
}

function saveOptions(opts: EditorOptions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(opts))
}

export type SetEditorOption = <K extends keyof EditorOptions>(
  key: K,
  value: EditorOptions[K],
) => void

export function useEditorOptions(): [EditorOptions, SetEditorOption] {
  const [options, setOptions] = useState<EditorOptions>(loadOptions)
  const setOption: SetEditorOption = (key, value) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: value }
      saveOptions(next)
      return next
    })
  }
  return [options, setOption]
}
