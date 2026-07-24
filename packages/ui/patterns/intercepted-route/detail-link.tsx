"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useDetailHistory } from "./use-detail-history";

type DetailLinkProps = ComponentProps<typeof Link>;

/**
 * DetailLink - 用于跳转到详情页的链接组件
 *
 * 在点击时自动保存当前页面作为来源，以便返回时能够回到正确的页面
 */
export function DetailLink({ onClick, ...props }: DetailLinkProps) {
  const history = useDetailHistory();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // 保存当前页面作为来源
    history.saveBase();
    // 调用原有的 onClick
    onClick?.(e);
  };

  return <Link {...props} onClick={handleClick} />;
}
