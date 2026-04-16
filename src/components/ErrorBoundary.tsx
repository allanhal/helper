import React from 'react'
import { I18nContext, translations } from '../i18n'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

/**
 * Error Boundary component to catch and display errors gracefully.
 * Wraps the entire app to prevent crashes from unhandled errors.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static contextType = I18nContext
  declare context: React.ContextType<typeof I18nContext>

  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console (could send to error reporting service)
    console.error('Uncaught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const s = this.context?.s ?? translations.en
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100vh',
          padding: 20,
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)'
        }}>
          <h1 style={{ color: 'var(--color-error)', marginBottom: 16 }}>{s.error_boundary_title}</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16, textAlign: 'center' }}>
            {s.error_boundary_message}
          </p>
          {this.state.error && (
            <details style={{ 
              backgroundColor: 'var(--bg-tertiary)', 
              padding: 12, 
              borderRadius: 6, 
              marginBottom: 16,
              fontFamily: 'monospace',
              fontSize: 12,
              maxWidth: 600,
              overflow: 'auto'
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>{s.error_boundary_details}</summary>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{this.state.error.toString()}</pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {s.btn_restart_app}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
