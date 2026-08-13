import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error, info) {
    console.error('DahonMD web UI crashed.', { message: error.message, componentStack: info.componentStack });
  }

  render() {
    if (this.state.failed) return <main className="auth-page"><section className="auth-card"><h1>Something went wrong</h1><p>The screen could not be displayed. Your saved server data was not removed.</p><button className="primary-button" onClick={() => window.location.reload()}>Reload DahonMD</button></section></main>;
    return this.props.children;
  }
}
