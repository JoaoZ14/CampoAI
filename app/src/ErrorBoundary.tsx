import { Component, type ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="workspace-state"><h1>Não conseguimos abrir esta tela</h1><p>Reabra o app para tentar novamente. Os registros já salvos continuam na sua conta.</p><button className="button primary" onClick={() => window.location.reload()}>Reabrir app</button></main>;
    return this.props.children;
  }
}
