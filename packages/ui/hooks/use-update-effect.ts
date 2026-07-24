"use client";

import { useEffect, useRef, type DependencyList, type EffectCallback } from "react";

/**
 * useUpdateEffect
 *
 * 类似 useEffect，但跳过首次渲染，只在依赖变化时执行
 */
export function useUpdateEffect(effect: EffectCallback, deps: DependencyList) {
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
