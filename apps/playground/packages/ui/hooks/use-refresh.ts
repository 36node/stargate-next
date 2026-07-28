"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

export type UseRefreshReturn = {
	pending: boolean;
	refresh: () => void;
};

/**
 * 封装 router.refresh()，通过 startTransition 触发，
 * 提供 pending 状态用于 loading 遮罩。
 *
 * 可直接用于纯客户端 DataTable，也可被 useDataTableSearch 组合使用。
 */
export function useRefresh(): UseRefreshReturn {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	const refresh = useCallback(() => {
		startTransition(() => {
			router.refresh();
		});
	}, [router]);

	return { pending, refresh };
}
