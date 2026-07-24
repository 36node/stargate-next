"use client";

import { Button } from "@repo/ui/components/shadcn/button";
import { ArrowLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { useDetailHistory } from "./use-detail-history";

type BackButtonProps = {
  defaultPath?: string;
  className?: string;
};

export function BackButton({ defaultPath = "/", className }: BackButtonProps) {
  const router = useRouter();
  const history = useDetailHistory();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // 获取来源页面，如果没有则使用默认路径
      const targetUrl = history.backToBase(defaultPath);
      router.push(targetUrl);
    },
    [router, defaultPath, history]
  );

  return (
    <Button
      className={className}
      onClick={handleClick}
      size="sm"
      variant="ghost"
    >
      <ArrowLeftIcon className="mr-1 h-4 w-4" />
      返回
    </Button>
  );
}
