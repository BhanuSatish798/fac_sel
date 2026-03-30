import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public props: Props;
  public state: State = { hasError: false, error: null };

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-transparent p-4">
          <div className="max-w-md w-full glass-card rounded-[40px] p-12 text-center border border-red-500/20 accent-glow">
            <div className="w-20 h-20 bg-red-500/20 rounded-[32px] flex items-center justify-center mx-auto mb-8">
              <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight mb-4">System_Error</h2>
            <p className="text-slate-500 mb-12 leading-relaxed">
              {this.state.error?.message || "An unexpected error occurred in the selection engine."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-8 py-5 rounded-3xl font-bold uppercase tracking-widest bg-red-500 text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
            >
              Restart_System
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
