import { Component } from 'react';
// Shows the error instead of a blank screen, so problems can be reported and fixed.
export default class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('App crashed:', error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div style={{ padding: '1.5rem', fontFamily: 'sans-serif' }}>
      <h2>Something went wrong</h2>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#fff', padding: '1rem', borderRadius: 8 }}>{String(this.state.error?.stack || this.state.error)}</pre>
      <button onClick={() => location.reload()}>Reload</button></div>;
  }
}
