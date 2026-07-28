"use client";

import React from "react";
import { createRoot } from "react-dom/client";

import { ConfirmDialog } from "./confirm-dialog";
import type { ConfirmVariant } from "./type";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
};

export function confirm(options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    // 创建容器元素
    const div = document.createElement("div");
    div.style.zIndex = "9999";
    document.body.appendChild(div);

    // 使用 React 18 的 createRoot 方法
    const root = createRoot(div);

    const cleanup = () => {
      // 延迟清理，让动画完成
      setTimeout(() => {
        root.unmount();
        if (div.parentNode) {
          document.body.removeChild(div);
        }
      }, 150);
    };

    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    // 渲染确认对话框
    root.render(
      React.createElement(ConfirmDialog, {
        isOpen: true,
        title: options.title,
        description: options.description,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        variant: options.variant,
        onConfirm: handleConfirm,
        onCancel: handleCancel,
      })
    );
  });
}
