import { Component, type ErrorInfo, type ReactNode } from 'react';
import { describeError, logger } from '../../lib/logger';

interface Props {
  children: ReactNode;
  /** Rendered instead of the scene when it fails. */
  fallback: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Keeps a 3D failure inside the 3D box.
 *
 * A driver quirk, a missing extension or a WebGL context loss must never take
 * the household with it: every meaningful action lives on the dashboard, and
 * the dashboard has to keep working.
 */
export class SceneBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('error', 'The 3D scene failed and was replaced by a fallback', {
      ...describeError(error),
      componentStack: info.componentStack?.split('\n').slice(0, 4).join(' '),
    });
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
