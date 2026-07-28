"use client";

import {
  Close as DialogClose,
  Content as DialogContent,
  Description as DialogDescription,
  Overlay as DialogOverlay,
  Portal as DialogPortal,
  Root as DialogRoot,
  Title as DialogTitle,
  Trigger as DialogTrigger,
} from "@radix-ui/react-dialog";
import { IndentDecreaseIcon, IndentIncreaseIcon, XIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from "react";

import { cn } from "@/packages/ui/lib/utils";

// ============================================================================
// Context
// ============================================================================

type SidePanelDialogContextValue = {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
  hasSidePanel: boolean;
  setHasSidePanel: (has: boolean) => void;
};

const SidePanelDialogContext = createContext<
  SidePanelDialogContextValue | undefined
>(undefined);

function useSidePanelDialog() {
  const context = useContext(SidePanelDialogContext);
  if (!context) {
    throw new Error("useSidePanelDialog must be used within a SidePanelDialog");
  }
  return context;
}

// ============================================================================
// Root Component
// ============================================================================

type SidePanelDialogProps = React.ComponentProps<typeof DialogRoot> & {
  defaultExpanded?: boolean;
};

function SidePanelDialog({
  defaultExpanded = false,
  children,
  ...props
}: SidePanelDialogProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hasSidePanel, setHasSidePanel] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <SidePanelDialogContext.Provider
      value={{
        expanded,
        setExpanded,
        toggleExpanded,
        hasSidePanel,
        setHasSidePanel,
      }}
    >
      <DialogRoot data-slot="side-panel-dialog" {...props}>
        {children}
      </DialogRoot>
    </SidePanelDialogContext.Provider>
  );
}

// ============================================================================
// Trigger
// ============================================================================

function SidePanelDialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogTrigger>) {
  return <DialogTrigger data-slot="side-panel-dialog-trigger" {...props} />;
}

// ============================================================================
// Portal & Overlay
// ============================================================================

function SidePanelDialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPortal>) {
  return <DialogPortal data-slot="side-panel-dialog-portal" {...props} />;
}

function SidePanelDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogOverlay>) {
  return (
    <DialogOverlay
      className={cn(
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      data-slot="side-panel-dialog-overlay"
      {...props}
    />
  );
}

// ============================================================================
// Content
// ============================================================================

type SidePanelDialogContentProps = React.ComponentProps<
  typeof DialogContent
> & {
  showCloseButton?: boolean;
};

function SidePanelDialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: SidePanelDialogContentProps) {
  const { expanded, hasSidePanel } = useSidePanelDialog();

  return (
    <SidePanelDialogPortal data-slot="side-panel-dialog-portal">
      <SidePanelDialogOverlay />
      <DialogContent
        className={cn(
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 flex translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background shadow-lg outline-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in",
          // 动态宽度
          expanded && hasSidePanel
            ? "w-full max-w-[calc(100%-2rem)] sm:max-w-4xl"
            : "w-full max-w-[calc(100%-2rem)] sm:max-w-lg",
          className
        )}
        data-expanded={expanded}
        data-slot="side-panel-dialog-content"
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClose
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
            data-slot="side-panel-dialog-close"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        )}
      </DialogContent>
    </SidePanelDialogPortal>
  );
}

// ============================================================================
// Side Panel (左侧参考面板)
// ============================================================================

type SidePanelDialogSideProps = React.ComponentProps<"div">;

function SidePanelDialogSide({
  className,
  children,
  ...props
}: SidePanelDialogSideProps) {
  const { expanded, setHasSidePanel } = useSidePanelDialog();

  // 注册侧边面板存在（使用 useLayoutEffect 确保状态在绘制前更新）
  useLayoutEffect(() => {
    setHasSidePanel(true);
    return () => {
      setHasSidePanel(false);
    };
  }, [setHasSidePanel]);

  // 收缩状态下不渲染
  if (!expanded) {
    return null;
  }

  return (
    <div
      className={cn("w-1/2 min-w-0 shrink-0 bg-muted/30 p-6", className)}
      data-slot="side-panel-dialog-side"
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Main Panel (右侧主面板)
// ============================================================================

type SidePanelDialogMainProps = React.ComponentProps<"div">;

function SidePanelDialogMain({
  className,
  children,
  ...props
}: SidePanelDialogMainProps) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 flex-col gap-4 p-6",
        className
      )}
      data-slot="side-panel-dialog-main"
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Toggle Button (展开/收缩切换按钮)
// ============================================================================

type SidePanelDialogToggleProps = Omit<
  React.ComponentProps<"button">,
  "onClick"
>;

function SidePanelDialogToggle({
  className,
  ...props
}: SidePanelDialogToggleProps) {
  const { expanded, toggleExpanded } = useSidePanelDialog();

  return (
    <button
      className={cn(
        "z-10 flex shrink-0 cursor-pointer items-center justify-center rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
      data-expanded={expanded}
      data-slot="side-panel-dialog-toggle"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleExpanded();
      }}
      type="button"
      {...props}
    >
      {expanded ? (
        <IndentIncreaseIcon className="size-5" />
      ) : (
        <IndentDecreaseIcon className="size-5" />
      )}
      <span className="sr-only">{expanded ? "收起侧边栏" : "展开侧边栏"}</span>
    </button>
  );
}

// ============================================================================
// Header, Footer, Title, Description
// ============================================================================

function SidePanelDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      data-slot="side-panel-dialog-header"
      {...props}
    />
  );
}

function SidePanelDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      data-slot="side-panel-dialog-footer"
      {...props}
    />
  );
}

function SidePanelDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogTitle>) {
  return (
    <DialogTitle
      className={cn("font-semibold text-lg leading-none", className)}
      data-slot="side-panel-dialog-title"
      {...props}
    />
  );
}

function SidePanelDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogDescription>) {
  return (
    <DialogDescription
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="side-panel-dialog-description"
      {...props}
    />
  );
}

// ============================================================================
// Close
// ============================================================================

function SidePanelDialogClose({
  ...props
}: React.ComponentProps<typeof DialogClose>) {
  return <DialogClose data-slot="side-panel-dialog-close" {...props} />;
}

// ============================================================================
// Exports
// ============================================================================

export {
  SidePanelDialog,
  SidePanelDialogTrigger,
  SidePanelDialogContent,
  SidePanelDialogSide,
  SidePanelDialogMain,
  SidePanelDialogToggle,
  SidePanelDialogHeader,
  SidePanelDialogFooter,
  SidePanelDialogTitle,
  SidePanelDialogDescription,
  SidePanelDialogClose,
  useSidePanelDialog,
};
