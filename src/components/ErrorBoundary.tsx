import React from "react"
import { Trans } from "@lingui/react/macro"

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info)
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          padding: "32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          color: "var(--text-secondary)",
          fontSize: "13px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "14px", color: "var(--text-primary)" }}>
          <Trans>The editor crashed — your data is safe.</Trans>
        </div>
        <button
          onClick={this.handleRetry}
          style={{
            background: "var(--resizer-active)",
            color: "#fff",
            border: "none",
            borderRadius: "5px",
            padding: "6px 14px",
            fontSize: "13px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Trans>Retry</Trans>
        </button>
      </div>
    )
  }
}
