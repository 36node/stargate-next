"use client";

import { useCallback, useRef, useState } from "react";

// 重载签名：当提供 defaultValue 时，返回类型为 T
export function useControl<T>(
  defaultValue: T | (() => T),
  value?: T,
  onChange?: (value: T) => void
): [T, (value: T | ((prevValue: T) => T)) => void];

// 重载签名：当未提供 defaultValue 时，返回类型为 T | undefined
export function useControl<T>(
  defaultValue?: undefined,
  value?: T,
  onChange?: (value: T) => void
): [T | undefined, (value: T | ((prevValue: T | undefined) => T)) => void];

/**
 * 用于处理受控和非受控状态的 Hook
 *
 * - 配合 useControl 使得当前组件既可以成为受控的，也可以成为非受控的
 * - 可以从非受控状态切换成受控状态，但是不能切换回去
 * - 如果外部传入的 value 是 undefined，那么就是非受控的，用内部的 innerValue 来管理
 * - 如果外部传入的 value 是有值的，直接返回 value，setValue 只调用 onChange
 * - 如果原本是受控的，突然 value 值变成了 undefined，仍然视为受控组件
 *
 * @param defaultValue - 默认值（用于非受控模式）或返回默认值的函数
 * @param value - 受控值（如果提供则为受控模式）
 * @param onChange - 值变化回调
 * @returns [currentValue, setValue] - 当前值和设置值的函数
 */
export function useControl<T>(
  defaultValue?: T | (() => T),
  value?: T,
  onChange?: (value: T) => void
): [T | undefined, (value: T | ((prevValue: T | undefined) => T)) => void] {
  // 粘性标记：一旦受控，永远受控
  const isControlledRef = useRef(value !== undefined);
  if (value !== undefined) {
    isControlledRef.current = true;
  }

  // 内部状态（仅在非受控模式下使用）
  const [innerValue, setInnerValue] = useState<T | undefined>(() => {
    if (value !== undefined) return value;
    return typeof defaultValue === "function"
      ? (defaultValue as () => T)()
      : defaultValue;
  });

  // 当前值：受控模式用 value，非受控模式用 innerValue
  const currentValue = isControlledRef.current ? value : innerValue;

  // 设置值的函数
  const setValue = useCallback(
    (valueOrUpdater: T | ((prevValue: T | undefined) => T)) => {
      // 计算新值
      const newValue =
        typeof valueOrUpdater === "function"
          ? (valueOrUpdater as (prevValue: T | undefined) => T)(currentValue)
          : valueOrUpdater;

      // 非受控模式下更新内部状态
      if (!isControlledRef.current) {
        setInnerValue(newValue);
      }

      // 无论受控还是非受控，都调用 onChange
      onChange?.(newValue);
    },
    [onChange, currentValue]
  );

  return [currentValue, setValue];
}
