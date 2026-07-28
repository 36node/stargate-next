"use client";

import { XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/packages/ui/components/shadcn/alert-dialog";
import { buttonVariants } from "@/packages/ui/components/shadcn/button";
import { cn } from "@/packages/ui/lib/utils";

type EditableBadgeProps = {
  /** 显示的文本 */
  label: string;
  /** 点击标签时的回调 */
  onEdit: () => void;
  /** 确认删除后的回调，返回 Promise 表示异步操作 */
  onDelete: () => Promise<void>;
  /** 删除确认对话框的标题 */
  deleteConfirmTitle?: string;
  /** 删除确认对话框的描述 */
  deleteConfirmDescription?: string;
  /**
   * 删除按钮的布局方式
   * - "fixed": 固定宽度，删除按钮始终占位，悬停时显示/隐藏内容，列宽稳定不抖动
   * - "dynamic": 动态伸缩，悬停时才占用空间（默认）
   */
  deleteButtonLayout?: "fixed" | "dynamic";
  /**
   * dynamic 模式下，删除按钮显示的延迟时间（毫秒）
   * 用于防止快速划过时误触删除按钮
   * 默认 300ms
   */
  deleteButtonDelay?: number;
};

export function EditableBadge({
  label,
  onEdit,
  onDelete,
  deleteConfirmTitle = "确认删除",
  deleteConfirmDescription,
  deleteButtonLayout = "dynamic",
  deleteButtonDelay = 300,
}: EditableBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFixed = deleteButtonLayout === "fixed";

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (isFixed) {
      // fixed 模式下立即显示
      setShowDeleteButton(true);
    } else {
      // dynamic 模式下延迟显示
      hoverTimeoutRef.current = setTimeout(() => {
        setShowDeleteButton(true);
      }, deleteButtonDelay);
    }
  }, [isFixed, deleteButtonDelay]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setShowDeleteButton(false);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  // 组件卸载时清理 timeout
  useEffect(
    () => () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    },
    []
  );

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
      setDeleteConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const description =
    deleteConfirmDescription ?? `确定要删除「${label}」吗？此操作无法撤销。`;

  return (
    <>
      {/* 外层容器 - 灰色圆角底色 */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover events for visual feedback only */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: hover events for visual feedback only */}
      <div
        className="relative inline-flex items-center rounded-md bg-secondary px-1 py-0.5 text-secondary-foreground text-xs"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* 内层蓝色可点击区域 */}
        <button
          className={cn(
            "rounded-lg px-1.5 py-0.5 transition-colors",
            isHovered && "bg-blue-100 text-blue-600"
          )}
          onClick={onEdit}
          type="button"
        >
          {label}
        </button>

        {/* 删除按钮 - 两种模式都使用相同的占位方式，通过 opacity 控制显示 */}
        {/* fixed: 始终占位，立即显示 */}
        {/* dynamic: 延迟显示，防止误触 */}
        <div
          className={cn(
            "ml-0.5 flex h-3.5 items-center justify-center overflow-hidden transition-all",
            isFixed || showDeleteButton ? "w-3.5" : "w-0"
          )}
        >
          <button
            className={cn(
              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full transition-all",
              showDeleteButton
                ? "bg-red-100 text-red-600 opacity-100"
                : "opacity-0",
              !showDeleteButton && "pointer-events-none"
            )}
            onClick={handleDeleteClick}
            title="删除"
            type="button"
          >
            <XIcon className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog onOpenChange={setDeleteConfirmOpen} open={deleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              {isDeleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
