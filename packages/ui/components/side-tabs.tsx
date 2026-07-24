"use client";

import {
  Content as TabsContent,
  List as TabsList,
  Root as TabsRoot,
  Trigger as TabsTrigger,
} from "@radix-ui/react-tabs";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useState,
} from "react";

import { cn } from "../lib/utils";

// Context 用于传递当前选中的 value
type SideTabsContextValue = {
  value: string | undefined;
};

const SideTabsContext = createContext<SideTabsContextValue>({
  value: undefined,
});

/**
 * SideTabs - 基于状态的垂直 Tab 导航组件
 *
 * 与 SideNav（路由模式）不同，SideTabs 不改变 URL，
 * 通过状态控制内容切换，适用于不需要 URL 变化的场景。
 *
 * @example
 * ```tsx
 * // 非受控模式
 * <SideTabs defaultValue="home">
 *   <SideTabsList>
 *     <SideTabsTrigger value="home">首页</SideTabsTrigger>
 *     <SideTabsTrigger value="product">产品详情</SideTabsTrigger>
 *   </SideTabsList>
 *   <SideTabsContent value="home">首页内容</SideTabsContent>
 *   <SideTabsContent value="product">产品内容</SideTabsContent>
 * </SideTabs>
 *
 * // 受控模式
 * const [value, setValue] = useState("home");
 * <SideTabs value={value} onValueChange={setValue}>
 *   ...
 * </SideTabs>
 * ```
 */
function SideTabs({
  className,
  children,
  value: controlledValue,
  defaultValue,
  onValueChange,
  ...props
}: ComponentProps<typeof TabsRoot>) {
  // 内部状态用于非受控模式
  const [internalValue, setInternalValue] = useState(defaultValue);

  // 判断是受控还是非受控模式
  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : internalValue;

  const handleValueChange = (newValue: string) => {
    if (!isControlled) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <SideTabsContext.Provider value={{ value: currentValue }}>
      <TabsRoot
        className={cn("flex", className)}
        data-slot="side-tabs"
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        value={controlledValue}
        {...props}
      >
        {children}
      </TabsRoot>
    </SideTabsContext.Provider>
  );
}

function SideTabsList({
  className,
  ...props
}: ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      className={cn("flex shrink-0 flex-col", className)}
      data-slot="side-tabs-list"
      {...props}
    />
  );
}

function SideTabsTrigger({
  className,
  children,
  value,
  ...props
}: ComponentProps<typeof TabsTrigger>) {
  const context = useContext(SideTabsContext);
  const isActive = context.value === value;

  // 基础样式 - 40px 高度
  const baseStyle =
    "relative flex items-center h-10 px-4 text-left text-sm transition-colors outline-none";

  // 未激活状态样式
  const inactiveStyle =
    "text-muted-foreground hover:text-foreground hover:bg-muted/30";

  // 激活状态样式：背景色
  const activeStyle = "text-foreground font-medium bg-muted";

  return (
    <TabsTrigger
      className={cn(
        baseStyle,
        isActive ? activeStyle : inactiveStyle,
        // 禁用状态
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        // focus 样式
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      data-slot="side-tabs-trigger"
      value={value}
      {...props}
    >
      {/* 激活状态的蓝色竖线 */}
      {isActive && (
        <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
      )}
      {children}
    </TabsTrigger>
  );
}

function SideTabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsContent>) {
  return (
    <TabsContent
      className={cn("min-w-0 flex-1 p-6 outline-none", className)}
      data-slot="side-tabs-content"
      {...props}
    />
  );
}

/**
 * SideTabsNav - 导航容器
 *
 * 包装 SideTabsList，添加固定宽度
 */
type SideTabsNavProps = {
  children: ReactNode;
  className?: string;
  /**
   * 导航区域宽度，默认 200px
   */
  width?: number | string;
};

function SideTabsNav({ children, className, width = 200 }: SideTabsNavProps) {
  const widthStyle = typeof width === "number" ? `${width}px` : width;

  return (
    <div
      className={cn("shrink-0", className)}
      data-slot="side-tabs-nav"
      style={{ width: widthStyle }}
    >
      {children}
    </div>
  );
}

export {
  SideTabs,
  SideTabsContent,
  SideTabsList,
  SideTabsNav,
  SideTabsTrigger,
};
