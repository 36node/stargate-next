"use client";

import type { Meta, StoryObj } from "@storybook/react";
import { Search } from "lucide-react";
import { useState } from "react";

import { SearchInput } from "./search-input";

/**
 * 搜索输入框组件，内置搜索图标和搜索回调。
 *
 * ## 特性
 * - 内置搜索图标
 * - 点击图标或按回车触发 `onSearch`
 * - 支持实时搜索 (`onValueChange`) 和确认搜索 (`onSearch`) 两种模式
 */
const meta = {
  title: "ui/SearchInput",
  component: SearchInput,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    placeholder: "搜索...",
  },
} satisfies Meta<typeof SearchInput>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * 基础搜索输入框，点击搜索图标或按回车触发搜索。
 */
export const Default: Story = {
  args: {
    onSearch: (value) => console.log("搜索:", value),
  },
};

/**
 * 结合 `onValueChange` 实现输入时实时搜索。
 *
 * - `onValueChange`: 触发自动补全、实时过滤
 * - `onSearch`: 执行完整搜索、跳转结果页
 */
export const LiveSearch: Story = {
  render: () => {
    const [searchTerm, setSearchTerm] = useState<string>();
    return (
      <div className="w-64 space-y-2">
        <SearchInput
          onSearch={(value) => console.log("确认搜索:", value)}
          onValueChange={(value) => {
            setSearchTerm(value);
            console.log("实时搜索:", value);
          }}
          placeholder="实时搜索"
          value={searchTerm}
        />
        <p className="text-muted-foreground text-sm">搜索词: {searchTerm}</p>
      </div>
    );
  },
};

/**
 * 搜索界面示例，展示 SearchInput 的典型应用场景。
 */
export const SearchInterface: Story = {
  render: () => {
    const handleSearch = (value: string | undefined) => {
      console.log(`搜索: ${value}`);
    };

    return (
      <div className="w-80 space-y-3 rounded-lg border p-4">
        <SearchInput
          onSearch={handleSearch}
          placeholder="搜索商品、店铺、品牌..."
          prefix={<Search className="h-4 w-4" />}
        />
        <div className="flex flex-wrap gap-2">
          <span className="text-muted-foreground text-sm">热门搜索:</span>
          {["iPhone", "MacBook", "iPad"].map((term) => (
            <button
              className="rounded bg-muted px-2 py-1 text-sm hover:bg-muted/80"
              key={term}
              onClick={() => handleSearch(term)}
              type="button"
            >
              {term}
            </button>
          ))}
        </div>
      </div>
    );
  },
};
