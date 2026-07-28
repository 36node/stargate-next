"use client";

import type { Meta, StoryObj } from "@storybook/react";
import { Lock } from "lucide-react";
import { useState } from "react";

import { PasswordInput } from "./password-input";

/**
 * 密码输入框组件，内置密码显示/隐藏切换功能。
 *
 * ## 特性
 * - 点击眼睛图标切换密码可见性
 * - 继承 Input 组件的所有功能（前缀图标、清除按钮、回车事件等）
 */
const meta = {
  title: "ui/PasswordInput",
  component: PasswordInput,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    placeholder: "请输入密码",
  },
} satisfies Meta<typeof PasswordInput>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * 基础密码输入框，点击眼睛图标可切换密码可见性。
 */
export const Default: Story = {};

/**
 * 结合 `prefix` 属性显示锁图标，增强视觉提示。
 */
export const WithPrefix: Story = {
  args: {
    prefix: <Lock className="h-4 w-4" />,
    placeholder: "请输入密码",
  },
};

/**
 * 同时启用 `clearable` 属性，用户可以快速清空密码。
 */
export const Clearable: Story = {
  render: () => {
    const [password, setPassword] = useState("");
    return (
      <div className="w-64 space-y-2">
        <PasswordInput
          clearable
          onClear={() => setPassword("")}
          onValueChange={setPassword}
          placeholder="可清除的密码输入框"
          prefix={<Lock className="h-4 w-4" />}
          value={password}
        />
        <p className="text-muted-foreground text-sm">
          密码长度: {password.length}
        </p>
      </div>
    );
  },
};

/**
 * 完整功能展示：前缀图标 + 受控模式 + 清除功能 + 回车事件。
 */
export const Full: Story = {
  render: () => {
    const [password, setPassword] = useState("");
    return (
      <div className="w-64 space-y-2">
        <PasswordInput
          clearable
          onClear={() => setPassword("")}
          onEnter={() => console.log("登录:", password)}
          onValueChange={setPassword}
          placeholder="登录密码（回车提交）"
          prefix={<Lock className="h-4 w-4" />}
          value={password}
        />
        <p className="text-muted-foreground text-sm">
          密码长度: {password.length}
        </p>
      </div>
    );
  },
};
