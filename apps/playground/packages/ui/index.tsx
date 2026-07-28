import type { ThemeProviderProps } from "next-themes";

import { Toaster } from "./components/shadcn/sonner";
import { TooltipProvider } from "./components/shadcn/tooltip";
import { ThemeProvider } from "./providers/theme";

type DesignSystemProviderProperties = ThemeProviderProps;

export const DesignSystemProvider = ({
  children,
  ...properties
}: DesignSystemProviderProperties) => (
  <ThemeProvider {...properties}>
    <TooltipProvider>{children}</TooltipProvider>
    <Toaster richColors />
  </ThemeProvider>
);

export { toast } from "sonner";

// ============================================
// 自定义组件统一导出
// ============================================
export * from "./components/confirm";
export * from "./components/data-table";
export * from "./components/editable-badge";
export * from "./components/input";
export * from "./components/mode-toggle";
export * from "./components/nav-bar";
export { Select as CustomSelect } from "./components/select";
// ============================================
// shadcn 组件统一导出
// ============================================
export * from "./components/shadcn/accordion";
export * from "./components/shadcn/alert";
export * from "./components/shadcn/alert-dialog";
export * from "./components/shadcn/aspect-ratio";
export * from "./components/shadcn/avatar";
export * from "./components/shadcn/badge";
export * from "./components/shadcn/breadcrumb";
export * from "./components/shadcn/button";
export * from "./components/shadcn/button-group";
export * from "./components/shadcn/calendar";
export * from "./components/shadcn/card";
export * from "./components/shadcn/carousel";
export * from "./components/shadcn/chart";
export * from "./components/shadcn/checkbox";
export * from "./components/shadcn/collapsible";
export * from "./components/shadcn/command";
export * from "./components/shadcn/context-menu";
export * from "./components/shadcn/dialog";
export * from "./components/shadcn/drawer";
export * from "./components/shadcn/dropdown-menu";
export * from "./components/shadcn/empty";
export * from "./components/shadcn/field";
export * from "./components/shadcn/form";
export * from "./components/shadcn/hover-card";
// export * from "./components/shadcn/input";
export * from "./components/shadcn/input-group";
export * from "./components/shadcn/input-otp";
export * from "./components/shadcn/item";
export * from "./components/shadcn/kbd";
export * from "./components/shadcn/label";
export * from "./components/shadcn/menubar";
export * from "./components/shadcn/navigation-menu";
export * from "./components/shadcn/pagination";
export * from "./components/shadcn/popover";
export * from "./components/shadcn/progress";
export * from "./components/shadcn/radio-group";
export * from "./components/shadcn/resizable";
export * from "./components/shadcn/scroll-area";
export * from "./components/shadcn/select";
export * from "./components/shadcn/separator";
export * from "./components/shadcn/sheet";
export * from "./components/shadcn/sidebar";
export * from "./components/shadcn/skeleton";
export * from "./components/shadcn/slider";
export * from "./components/shadcn/sonner";
export * from "./components/shadcn/spinner";
export * from "./components/shadcn/switch";
export * from "./components/shadcn/tabs";
export * from "./components/shadcn/textarea";
// Table 组件与 data-table 的 Table 类型冲突，需要从深层路径导入
// export * from "./components/shadcn/table";
export * from "./components/shadcn/toggle";
export * from "./components/shadcn/toggle-group";
export * from "./components/shadcn/tooltip";
// ============================================
// 自定义组件统一导出
// ============================================
export * from "./components/side-nav";
export * from "./components/side-panel-dialog";
export * from "./components/side-tabs";
export * from "./components/truncatable";

// ============================================
// Hooks 统一导出
// ============================================

export * from "./hooks/use-control";
export * from "./hooks/use-mobile";
export * from "./hooks/use-overflow-title";
export * from "./hooks/use-refresh";
export * from "./hooks/use-search";
export * from "./hooks/use-update-effect";

// ============================================
// Lib 统一导出
// ============================================

export * from "./lib/navigation";
export * from "./lib/utils";

// ============================================
// Patterns 统一导出
// ============================================

export * from "./patterns/intercepted-route";
