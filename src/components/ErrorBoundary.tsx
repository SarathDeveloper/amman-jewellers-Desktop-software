import { Component, type ErrorInfo, type ReactNode } from 'react'
import type { DiagnosticReport } from '@shared/types'
import { reportFatal } from '../lib/diagnostics'
import { FatalErrorScreen } from './FatalErrorScreen'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
  report: DiagnosticReport | null
}

function placeholderReport(error: Error): DiagnosticReport {
  return {
    referenceId: '…',
    timestamp: new Date().toISOString(),
    version: 'unknown',
    category: 'crash',
    message: error.message,
    stack: error.stack,
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, report: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, report: null }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = [error.stack, info.componentStack].filter(Boolean).join('\n')
    void reportFatal({
      message: error.message,
      stack,
      source: 'boundary',
    }).then((report) => {
      this.setState({ report })
    })
  }

  render() {
    if (this.state.error) {
      return <FatalErrorScreen error={this.state.report ?? placeholderReport(this.state.error)} />
    }

    return this.props.children
  }
}
