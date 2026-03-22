import { useState, useRef, useEffect, useCallback } from "react"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
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
    onCreateLocal(name.trim() || t`My Outline`)
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
    <h1 className={styles.appName}><Trans>Outlines</Trans></h1>
    <p className={styles.tagline}><Trans>A fast, local-first outliner</Trans></p>
    <div className={styles.actions}>
      <button className={styles.primaryBtn} onClick={onSignIn}>
        <Trans>Sign in to sync</Trans>
      </button>
      <button className={styles.secondaryBtn} onClick={onStartLocally}>
        <Trans>Start locally</Trans>
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
    <h2 className={styles.sectionTitle}><Trans>Name your outline</Trans></h2>
    <input
      ref={inputRef}
      className={styles.nameInput}
      type="text"
      placeholder={t`My Outline`}
      value={name}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
    <div className={styles.actions}>
      <button className={styles.primaryBtn} onClick={onCreate}>
        <Trans>Create</Trans>
      </button>
      <button className={styles.backLink} onClick={onBack}>
        <Trans>← Back</Trans>
      </button>
    </div>
  </div>
)
