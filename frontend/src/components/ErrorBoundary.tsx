import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: 'hsl(35, 20%, 97%)',
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <p style={{ fontSize: '16px', color: '#c0392b', marginBottom: '8px' }}>
              页面加载出错
            </p>
            <p style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
              {this.state.error?.message || '未知错误'}
            </p>
            <details style={{ textAlign: 'left', fontSize: '11px', color: '#999', marginBottom: '16px' }}>
              <summary>技术详情</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '8px' }}>
                {this.state.error?.stack}
              </pre>
              <p style={{ marginTop: '8px' }}>
                UA: {typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
              </p>
            </details>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px',
                background: 'hsl(175, 45%, 38%)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              刷新重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
