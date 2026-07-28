"use client";

import type { Meta, StoryObj } from "@storybook/react";
import { Lock, Search, User } from "lucide-react";
import { useState } from "react";

import { Input, PasswordInput, SearchInput } from "./index";

/**
 * 增强版 Input 组件，支持前缀/后缀图标、清除按钮、回车事件等功能。
 *
 * ## 特性
 * - 支持受控和非受控模式
 * - 可配置前缀/后缀元素
 * - 内置清除按钮功能
 * - 支持回车键事件
 * - 统一的值变化回调 `onValueChange`
 */
const meta = {
  title: "ui/Input",
  component: Input,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    placeholder: "请输入内容",
  },
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * 最基础的输入框用法，仅设置 placeholder。
 */
export const Default: Story = {};

/**
 * 使用 `prefix` 属性在输入框左侧显示图标。
 * 常用于表示输入内容的类型，如用户名、邮箱等。
 */
export const WithPrefix: Story = {
  args: {
    prefix: <User className="h-4 w-4" />,
    placeholder: "请输入用户名",
  },
};

/**
 * 设置 `clearable` 属性后，当输入框有内容时会显示清除按钮。
 * 点击清除按钮会清空输入内容。
 */
export const Clearable: Story = {
  args: {
    clearable: true,
    placeholder: "可清除的输入框",
    defaultValue: "试试清除我",
  },
};

/**
 * 同时使用 `suffix` 和 `clearable` 属性。
 * 当两者同时存在时，会在清除按钮和后缀元素之间显示分隔线。
 */
export const WithSuffixAndClearable: Story = {
  render: () => {
    const [value, setValue] = useState("");
    return (
      <div className="w-64 space-y-2">
        <Input
          clearable
          onClear={() => setValue("")}
          onValueChange={setValue}
          placeholder="带后缀的可清除输入框"
          suffix={
            <Search
              className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={() => console.log(`搜索: ${value}`)}
            />
          }
          value={value}
        />
        <p className="text-muted-foreground text-sm">当前值: {value}</p>
      </div>
    );
  },
};

/**
 * 通过 `value` 和 `onValueChange` 实现受控输入。
 * `onValueChange` 直接返回字符串值，比原生 `onChange` 更方便使用。
 */
export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState("");
    return (
      <div className="w-64 space-y-2">
        <Input
          onValueChange={setValue}
          placeholder="受控输入框"
          value={value}
        />
        <p className="text-muted-foreground text-sm">当前值: {value}</p>
      </div>
    );
  },
};

/**
 * 使用 `onEnter` 属性监听回车键事件。
 * 常用于搜索框、表单提交等场景。
 */
export const OnEnter: Story = {
  args: {
    placeholder: "按回车键试试",
    onEnter: () => console.log("回车键被按下！"),
  },
};

/**
 * 登录表单示例，展示 Input 和 PasswordInput 的组合使用。
 */
export const LoginForm: Story = {
  render: () => (
    <div className="w-72 space-y-3 rounded-lg border p-4">
      <Input
        clearable
        placeholder="用户名"
        prefix={<User className="h-4 w-4" />}
      />
      <PasswordInput
        clearable
        onEnter={() => console.log("登录！")}
        placeholder="密码"
        prefix={<Lock className="h-4 w-4" />}
      />
      <button
        className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        onClick={() => console.log("登录！")}
        type="button"
      >
        登录
      </button>
    </div>
  ),
};

/**
 * 综合表单示例，展示多种 Input 组件的组合使用及表单状态管理。
 */
export const ComprehensiveForm: Story = {
  render: () => {
    const [formData, setFormData] = useState({
      username: "",
      password: "",
      search: "",
    });

    const updateForm = (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

    return (
      <div className="w-80 space-y-4 rounded-lg border p-4">
        <Input
          clearable
          onValueChange={updateForm("username")}
          placeholder="用户名"
          prefix={<User className="h-4 w-4" />}
          value={formData.username}
        />
        <PasswordInput
          clearable
          onValueChange={updateForm("password")}
          placeholder="密码"
          prefix={<Lock className="h-4 w-4" />}
          value={formData.password}
        />
        <SearchInput
          onSearch={(value) => console.log("搜索:", value)}
          onValueChange={updateForm("search")}
          placeholder="搜索兴趣标签..."
          value={formData.search}
        />
        <div className="flex gap-2">
          <button
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            onClick={() => console.log("表单数据:", formData)}
            type="button"
          >
            提交
          </button>
          <button
            className="rounded-md bg-muted px-4 py-2 text-muted-foreground hover:bg-muted/80"
            onClick={() =>
              setFormData({ username: "", password: "", search: "" })
            }
            type="button"
          >
            重置
          </button>
        </div>
        <pre className="rounded bg-muted p-2 text-xs">
          {JSON.stringify(formData, null, 2)}
        </pre>
      </div>
    );
  },
};
