"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { InterceptedProvider } from "./intercepted-context";

type InterceptedWrapperProps = {
  pathPrefix: string;
  children: React.ReactNode;
  zIndex?: number;
  /**
   * 当 children 需要按可视区域撑满高度（而不是按内容居中）时设为 true。
   * 用于 detail 页内嵌可滚/分页的内容区，例如实例详情。
   */
  stretch?: boolean;
};

export function InterceptedWrapper({
  pathPrefix,
  children,
  zIndex = 41,
  stretch = false,
}: InterceptedWrapperProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  // 当路径不匹配时,重置 isOpen 状态
  useEffect(() => {
    if (pathname.startsWith(pathPrefix)) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [pathname, pathPrefix]);

  const closeDetail = useCallback(() => {
    setIsOpen(false);
    router.back();
  }, [router]);

  // 使用 pathname 或 isOpen 任一条件来控制显示
  if (!(pathname.startsWith(pathPrefix) && isOpen)) {
    return null;
  }

  if (stretch) {
    return (
      <InterceptedProvider value={{ closeDetail }}>
        <div
          className="scrollbar-custom absolute inset-0 flex flex-col overflow-hidden bg-background p-6"
          style={{ zIndex }}
        >
          {children}
        </div>
      </InterceptedProvider>
    );
  }

  return (
    <InterceptedProvider value={{ closeDetail }}>
      {/* 内容区域覆盖层 - 绝对定位，只覆盖内容区域 */}
      <div
        className="scrollbar-custom absolute inset-0 flex items-center justify-center overflow-auto bg-background"
        style={{ zIndex }}
      >
        {/* 内容区域 */}
        <div className="relative flex h-full w-full flex-col p-6">
          {/* 页面内容 */}
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </InterceptedProvider>
  );
}
