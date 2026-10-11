"use client";

import { Component, type ReactNode } from "react";

interface Props {
  /** What to show instead if something below fails to load or crashes. */
  fallback: ReactNode;
  children: ReactNode;
}

/** Keeps a failure in one part of the page (for example the map's code failing to download offline) from taking the rest down. */
export default class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
