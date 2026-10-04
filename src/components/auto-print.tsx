"use client";

import { useEffect } from "react";

/** 打印页自动唤起打印对话框（也可手动 Ctrl+P） */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return null;
}
