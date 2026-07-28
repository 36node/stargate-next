"use client";

import { CirclePlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/packages/ui/components/shadcn/badge";
import { Button } from "@/packages/ui/components/shadcn/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/packages/ui/components/shadcn/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/packages/ui/components/shadcn/popover";
import { Separator } from "@/packages/ui/components/shadcn/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/packages/ui/components/shadcn/tooltip";
import {
  getNodesByKeys,
  TreeCommand,
  type TreeNodeData,
} from "@/packages/ui/components/tree";
import { useControl } from "@/packages/ui/hooks/use-control";
import { cn } from "@/packages/ui/lib/utils";

export type SelectionType<TMultiple extends boolean> = TMultiple extends true
  ? string[]
  : string | null;

export type TreeFilterProps<TData, TMultiple extends boolean = false> = {
  title?: string;
  data: TreeNodeData<TData>[];
  multiple?: TMultiple;
  // TreeCommand 的其他属性
  defaultExpandAll?: boolean;
  defaultExpandedKeys?: string[];
  filterTreeNode?: (node: TreeNodeData<TData>, searchValue: string) => boolean;

  searchPlaceholder?: string;
  className?: string;

  defaultValue?: SelectionType<TMultiple>;
  value?: SelectionType<TMultiple>;
  onChange?: (value?: SelectionType<TMultiple>) => void;
};

export function TreeFilter<TData = unknown, TMultiple extends boolean = false>({
  title,
  data,
  multiple = false as TMultiple,
  defaultExpandAll = false,
  defaultExpandedKeys,
  filterTreeNode,
  searchPlaceholder = "搜索...",
  className,
  defaultValue,
  value,
  onChange,
}: TreeFilterProps<TData, TMultiple>) {
  const isMultiple = multiple;
  // filterValue 永远是数组，没有选中值就是空数组
  const [selection, setSelection] = useControl<SelectionType<TMultiple>>(
    (defaultValue || null) as SelectionType<TMultiple>,
    value,
    onChange
  );
  const [open, setOpen] = useState(false);

  const selectedValues = useMemo(() => {
    if (isMultiple) {
      return (selection as string[]) ?? [];
    }
    return selection ? [selection as string] : [];
  }, [isMultiple, selection]);

  // 获取选中的节点用于显示
  const selectedNodes = useMemo(
    () => getNodesByKeys(data, selectedValues),
    [data, selectedValues]
  );

  // 选中变化时立即触发过滤
  const handleSelectionChange = (newValue: string[] | string | null) => {
    setSelection(newValue as SelectionType<TMultiple>);
  };

  const handleReset = () => {
    setSelection(null as SelectionType<TMultiple>);
    setOpen(false);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="border-dashed px-2.5" size="sm" variant="outline">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-full items-center gap-2">
                <CirclePlusIcon className="h-4 w-4" />
                <div className="hidden h-full items-center lg:flex">
                  {title}
                  {selectedValues?.length > 0 && (
                    <>
                      <Separator
                        className="mx-2 h-4 shrink-0"
                        orientation="vertical"
                      />
                      <Badge
                        className="rounded-sm px-1 font-normal lg:hidden"
                        variant="secondary"
                      >
                        {selectedValues?.length}
                      </Badge>
                      <div className="hidden space-x-1 lg:flex">
                        {selectedValues.length > 2 ? (
                          <Badge
                            className="rounded-sm px-1 font-normal"
                            variant="secondary"
                          >
                            {selectedValues.length} 项过滤
                          </Badge>
                        ) : (
                          selectedNodes.map((node: TreeNodeData<TData>) => (
                            <Badge
                              className="rounded-sm px-1 font-normal"
                              key={node.key}
                              variant="secondary"
                            >
                              <span className="max-w-18 overflow-hidden text-ellipsis whitespace-nowrap text-nowrap">
                                {node.name}
                              </span>
                            </Badge>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1 lg:hidden">
              {title}
              {selectedNodes.length > 0 && (
                <>
                  <Separator
                    className="mx-1 shrink-0 data-[orientation=vertical]:h-2"
                    orientation="vertical"
                  />
                  {selectedNodes.length > 2 ? (
                    <span>{selectedNodes.length} 项过滤</span>
                  ) : (
                    selectedNodes.map((node: TreeNodeData<TData>) => (
                      <span key={node.key}>{node.name}</span>
                    ))
                  )}
                </>
              )}
            </TooltipContent>
          </Tooltip>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("max-h-[400px] w-48 p-0", className)}
      >
        <div className="flex max-h-[400px] flex-col">
          <div className="flex-1 overflow-hidden">
            <TreeCommand<TData, TMultiple>
              data={data}
              defaultExpandAll={defaultExpandAll}
              defaultExpandedKeys={defaultExpandedKeys}
              filterTreeNode={filterTreeNode}
              multiple={isMultiple}
              onSelectionChange={handleSelectionChange}
              searchPlaceholder={searchPlaceholder}
              selection={selection}
            />
          </div>
          <Command>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                className="cursor-pointer justify-center text-center"
                disabled={selectedValues.length === 0}
                onSelect={handleReset}
              >
                重置
              </CommandItem>
            </CommandGroup>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  );
}
