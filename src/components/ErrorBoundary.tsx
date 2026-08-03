import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

interface Props {
  children: ReactNode;
  fallbackName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in boundary:', error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#181825',
            border: '1px solid #f38ba8',
            color: '#f38ba8',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '11px',
          }}
        >
          <div style={{ fontWeight: 'bold' }}>
            [{this.props.fallbackName || 'PANEL'} ERROR]
          </div>
          <div style={{ color: '#cdd6f4', marginTop: '4px' }}>
            {this.state.error?.message || 'An unexpected rendering error occurred'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: '8px', padding: '2px 6px', color: '#89b4fa' }}
          >
            RETRY PANEL
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
