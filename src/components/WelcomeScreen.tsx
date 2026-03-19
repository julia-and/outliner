import { useState, useRef, useEffect, useCallback } from "react"
import { db } from "../store"
import styles from "./WelcomeScreen.module.css"

type View = "choice" | "naming"

export const WelcomeScreen = ({
  onCreateLocal,
}: {
  onCreateLocal: (name: string) => void
}) => {
  const [view, setView] = useState<View>("choice")
  const [name, setName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (view === "naming") inputRef.current?.focus()
  }, [view])

  const handleCreate = useCallback(() => {
    onCreateLocal(name.trim() || "My Outline")
  }, [name, onCreateLocal])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleCreate()
    },
    [handleCreate],
  )

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        {view === "choice" ? (
          <ChoiceView onSignIn={() => db.cloud.login()} onStartLocally={() => setView("naming")} />
        ) : (
          <NamingView
            name={name}
            inputRef={inputRef}
            onChange={setName}
            onKeyDown={handleKeyDown}
            onCreate={handleCreate}
            onBack={() => setView("choice")}
          />
        )}
      </div>
    </div>
  )
}

const ChoiceView = ({
  onSignIn,
  onStartLocally,
}: {
  onSignIn: () => void
  onStartLocally: () => void
}) => (
  <div className={styles.content}>
    <h1 className={styles.appName}>Outlines</h1>
    <p className={styles.tagline}>A fast, local-first outliner</p>
    <div className={styles.actions}>
      <button className={styles.primaryBtn} onClick={onSignIn}>
        Sign in to sync
      </button>
      <button className={styles.secondaryBtn} onClick={onStartLocally}>
        Start locally
      </button>
    </div>
  </div>
)

const NamingView = ({
  name,
  inputRef,
  onChange,
  onKeyDown,
  onCreate,
  onBack,
}: {
  name: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onCreate: () => void
  onBack: () => void
}) => (
  <div className={styles.content}>
    <h2 className={styles.sectionTitle}>Name your outline</h2>
    <input
      ref={inputRef}
      className={styles.nameInput}
      type="text"
      placeholder="My Outline"
      value={name}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
    <div className={styles.actions}>
      <button className={styles.primaryBtn} onClick={onCreate}>
        Create
      </button>
      <button className={styles.backLink} onClick={onBack}>
        ← Back
      </button>
    </div>
  </div>
)
