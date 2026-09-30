import {Component, type ReactNode} from "react";

import {BootError} from "./BootError";

interface State {
  error: Error | null;
}

/** <App /> 以下(Canvas 内のレンダラー初期化失敗を含む)の例外を BootScreen のエラー画面と同じ見た目で出す */
export class BootErrorBoundary extends Component<
  {children?: ReactNode},
  State
> {
  state: State = {error: null};

  static getDerivedStateFromError(e: unknown): State {
    return {error: e instanceof Error ? e : new Error(String(e))};
  }

  componentDidCatch(e: unknown): void {
    console.error(e);
  }

  render() {
    const {error} = this.state;
    return error ? <BootError error={error} /> : this.props.children;
  }
}
