import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MathKhata renderer failure', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="recovery-screen" role="alert">
        <span className="recovery-screen__mark" aria-hidden="true">∫</span>
        <p className="eyebrow">Protected recovery</p>
        <h1>MathKhata needs a restart.</h1>
        <p>
          Your last locally saved notebook remains on this device. Restart the app, then use the notebook menu to
          export a structured backup if the problem repeats.
        </p>
        <button type="button" className="primary-button" onClick={() => window.location.reload()}>
          Restart MathKhata
        </button>
      </main>
    );
  }
}
