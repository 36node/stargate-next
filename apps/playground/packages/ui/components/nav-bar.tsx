"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { buildHref, isRouteActive } from "../lib/navigation";
import { cn } from "../lib/utils";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "./shadcn/navigation-menu";

export type NavRoute = {
  href?: string;
  title: string;
  children?: NavRoute[];
  disabled?: boolean;
};

type NavBarProps = {
  routes: NavRoute[];
  className?: string;
  /**
   * 是否保留当前 URL 的 search params
   */
  preserveSearchParams?: boolean;
};

/**
 * NavBar - 基于 URL 路由的 Tab 导航组件
 *
 * 与 shadcn/ui 的 Tabs 组件不同，NavBar 的每个 Tab 都有独立的 URL 路由，
 * 适用于需要 URL 变化的场景。
 *
 * @example
 * ```tsx
 * // 在 layout.tsx 中定义导航
 * const navs: NavRoute[] = [
 *   { title: '设备列表', href: '/devices/list/devices' },
 *   { title: '生产计划', href: '/devices/list/plans' },
 * ];
 *
 * export default function Layout({ children }) {
 *   return (
 *     <div>
 *       <NavBar routes={navs} className="mb-4" />
 *       {children}
 *     </div>
 *   );
 * }
 * ```
 */
export function NavBar({
  routes,
  className,
  preserveSearchParams = false,
}: NavBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = preserveSearchParams ? searchParams.toString() : "";

  return (
    <NavigationMenu className={className}>
      <NavigationMenuList className="gap-0 rounded-lg bg-muted p-1">
        {routes.map((route, index) => (
          <NavItem
            isLast={index === routes.length - 1}
            key={route.title}
            pathname={pathname}
            route={route}
            searchString={searchString}
          />
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

// 通用链接组件：有 href 渲染 Link，无 href 渲染 span
// 注意：不使用 NavigationMenuLink，因为它有默认的 hover 样式无法覆盖
const NavLink = ({
  href,
  searchString,
  disabled,
  className,
  children,
}: {
  href?: string;
  searchString: string;
  disabled?: boolean;
  className: string;
  children: React.ReactNode;
}) => {
  if (!href || disabled) {
    return <span className={className}>{children}</span>;
  }
  return (
    <Link className={className} href={buildHref(href, searchString)}>
      {children}
    </Link>
  );
};

// 渲染单个菜单项
const NavItem = ({
  route,
  pathname,
  searchString,
  isLast,
}: {
  route: NavRoute;
  pathname: string;
  searchString: string;
  isLast?: boolean;
}) => {
  const isActive = isRouteActive(pathname, route.href, route.children);

  // 基础样式
  const baseStyle =
    "relative inline-flex h-8 w-max items-center justify-center rounded-md px-4 text-sm transition-colors outline-none";

  // 未激活状态样式：灰色文字，hover 时变深
  const inactiveStyle =
    "bg-transparent text-muted-foreground font-normal hover:text-foreground hover:bg-transparent";

  // 激活状态样式：蓝色文字 + 背景色
  const activeStyle =
    "bg-background text-primary font-medium shadow-sm hover:bg-background hover:text-primary focus:bg-background focus:text-primary";

  // 禁用样式
  const disabledStyle = "opacity-50 cursor-not-allowed pointer-events-none";

  // 有子菜单的项目
  if (route.children && route.children.length > 0) {
    return (
      <NavigationMenuItem key={route.title}>
        <NavigationMenuTrigger
          className={cn(
            baseStyle,
            isActive ? activeStyle : inactiveStyle,
            route.disabled && disabledStyle
          )}
          disabled={route.disabled}
        >
          {route.title}
        </NavigationMenuTrigger>
        <NavigationMenuContent
          className={cn(isLast && "right-0 left-auto z-50")}
        >
          <ul className="grid w-36">
            {route.children.map((child) => (
              <li key={child.title}>
                <NavLink
                  className={cn(
                    "block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                    child.disabled && disabledStyle,
                    pathname === child.href &&
                      "bg-accent text-accent-foreground"
                  )}
                  disabled={child.disabled}
                  href={child.href}
                  searchString={searchString}
                >
                  {child.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
    );
  }

  // 普通菜单项
  return (
    <NavigationMenuItem key={route.title}>
      <NavLink
        className={cn(
          baseStyle,
          isActive ? activeStyle : inactiveStyle,
          route.disabled && disabledStyle
        )}
        disabled={route.disabled}
        href={route.href}
        searchString={searchString}
      >
        {route.title}
      </NavLink>
    </NavigationMenuItem>
  );
};
