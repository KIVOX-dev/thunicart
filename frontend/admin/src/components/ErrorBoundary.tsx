import { Component, type ReactNode } from 'react';
import { Button } from '@thunikart/ui';
import { StatusPage } from './StatusPage';

/** Catches render errors so one broken screen does not blank the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (!this.state.failed) return this.props.children;
    return <StatusPage code="Oops" title="Something broke" body="This screen hit a problem. Reload and try again. Your saved data is safe." action={<Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>} />;
  }
}
