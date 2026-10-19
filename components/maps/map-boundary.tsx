"use client";

import { Component, type ReactNode } from "react";

// Catches a map chunk that fails to load or throws, so the page keeps working
// with the fallback instead (spec 0011, AC-9).
export class MapBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
