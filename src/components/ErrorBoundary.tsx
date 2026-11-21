import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Ocorreu um erro inesperado.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#08080A] text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#111115] border border-zinc-800 p-6 space-y-4">
            <h1 className="text-lg font-semibold text-zinc-50">
              Algo interrompeu o estúdio
            </h1>
            <p className="text-xs text-zinc-400 break-words">{this.state.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 rounded-lg bg-[#F2B705] text-zinc-950 text-xs font-semibold hover:bg-[#e5ad04] transition-colors"
            >
              Recarregar Estúdio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
