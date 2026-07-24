"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { buildHref, isRouteActive } from "../lib/navigation";
import { cn } from "../lib/utils";

export type SideNavRoute = {
  href?: string;
  title: string;
  children?: SideNavRoute[];
  disabled?: boolean;
};

type SideNavProps = {
  routes: SideNavRoute[];
  className?: string;
  /**
   * 是否保留当前 URL 的 search params
   */
  preserveSearchParams?: boolean;
};

/**
 * SideNav - 基于 URL 路由的垂直 Tab 导航组件
 *
 * 与 NavBar 水平导航不同，SideNav 垂直排布导航项，适用于侧边栏导航场景。
 * 每个 Tab 都有独立的 URL 路由，内容区域在右侧展示。
 *
 * @example
 * ```tsx
 * // 在 layout.tsx 中定义导航和布局
 * const navs: SideNavRoute[] = [
 *   { title: '首页', href: '/settings/home' },
 *   { title: '产品详情', href: '/settings/product' },
 *   { title: '关于我们', href: '/settings/about' },
 * ];
 *
 * export default function Layout({ children }) {
 *   return (
 *     <SideNavLayout routes={navs}>
 *       {children}
 *     </SideNavLayout>
 *   );
 * }
 * ```
 */
export function SideNav({
  routes,
  className,
  preserveSearchParams = false,
}: SideNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = preserveSearchParams ? searchParams.toString() : "";

  return (
    <nav className={cn("flex flex-col", className)}>
      {routes.map((route) => (
        <SideNavItem
          key={route.title}
          pathname={pathname}
          route={route}
          searchString={searchString}
        />
      ))}
    </nav>
  );
}

// 通用链接组件：有 href 渲染 Link，无 href 渲染 span
const SideNavLink = ({
  href,
  searchString,
  disabled,
  className,
  children,
  isActive,
}: {
  href?: string;
  searchString: string;
  disabled?: boolean;
  className: string;
  children: ReactNode;
  isActive?: boolean;
}) => {
  const content = (
    <>
      {isActive && (
        <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
      )}
      {children}
    </>
  );

  if (!href || disabled) {
    return <span className={className}>{content}</span>;
  }
  return (
    <Link className={className} href={buildHref(href, searchString)}>
      {content}
    </Link>
  );
};

// 渲染单个导航项
const SideNavItem = ({
  route,
  pathname,
  searchString,
}: {
  route: SideNavRoute;
  pathname: string;
  searchString: string;
}) => {
  const isActive = isRouteActive(pathname, route.href, route.children);

  // 基础样式 - 40px 高度
  const baseStyle =
    "relative flex items-center h-10 px-4 text-sm transition-colors";

  // 未激活状态样式
  const inactiveStyle =
    "text-muted-foreground hover:text-foreground hover:bg-muted/30";

  // 激活状态样式：背景色
  const activeStyle = "text-foreground font-medium bg-muted";

  // 禁用样式
  const disabledStyle = "opacity-50 cursor-not-allowed pointer-events-none";

  // 有子菜单的项目 - 展开显示子项
  if (route.children && route.children.length > 0) {
    return (
      <div key={route.title}>
        <SideNavLink
          className={cn(
            baseStyle,
            isActive ? activeStyle : inactiveStyle,
            route.disabled && disabledStyle,
            "cursor-default"
          )}
          disabled
          isActive={isActive}
          searchString={searchString}
        >
          {route.title}
        </SideNavLink>
        <div className="ml-4">
          {route.children.map((child) => (
            <SideNavItem
              key={child.title}
              pathname={pathname}
              route={child}
              searchString={searchString}
            />
          ))}
        </div>
      </div>
    );
  }

  // 普通导航项
  return (
    <SideNavLink
      className={cn(
        baseStyle,
        isActive ? activeStyle : inactiveStyle,
        route.disabled && disabledStyle
      )}
      disabled={route.disabled}
      href={route.href}
      isActive={isActive}
      searchString={searchString}
    >
      {route.title}
    </SideNavLink>
  );
};

/**
 * SideNavLayout - 侧边导航布局组件
 *
 * 提供完整的侧边导航 + 内容区域布局
 *
 * @example
 * ```tsx
 * const navs: SideNavRoute[] = [
 *   { title: '首页', href: '/settings/home' },
 *   { title: '产品详情', href: '/settings/product' },
 * ];
 *
 * export default function Layout({ children }) {
 *   return (
 *     <SideNavLayout routes={navs}>
 *       {children}
 *     </SideNavLayout>
 *   );
 * }
 * ```
 */
type SideNavLayoutProps = {
  routes: SideNavRoute[];
  children: ReactNode;
  className?: string;
  navClassName?: string;
  contentClassName?: string;
  /**
   * 导航区域宽度，默认 200px
   */
  navWidth?: number | string;
  /**
   * 是否保留当前 URL 的 search params
   */
  preserveSearchParams?: boolean;
};

export function SideNavLayout({
  routes,
  children,
  className,
  navClassName,
  contentClassName,
  navWidth = 200,
  preserveSearchParams = false,
}: SideNavLayoutProps) {
  const widthStyle = typeof navWidth === "number" ? `${navWidth}px` : navWidth;

  return (
    <div className={cn("flex", className)}>
      <div
        className={cn("shrink-0 border-r", navClassName)}
        style={{ width: widthStyle }}
      >
        <SideNav preserveSearchParams={preserveSearchParams} routes={routes} />
      </div>
      <div className={cn("min-w-0 flex-1 p-6", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
