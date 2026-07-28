"use client";

import type { ChangeEvent, FormEvent, RefObject } from "react";
import { useRef, useState, useTransition } from "react";

import {
  type AccountActionState,
  createAccountAction,
  deleteAccountAction,
  resetAccountPasswordAction,
  updateAccountActiveAction,
  updateAccountNameAction,
} from "./action";

type AccountActionsProps = {
  name: string;
  userId: string;
  username: string;
};

const initialState: AccountActionState = {};

export function CreateAccountButton({
  allowName = true,
}: {
  allowName?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setState(initialState);
    dialogRef.current?.showModal();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    if (formData.get("password") !== formData.get("confirmPassword")) {
      setState({ error: "两次输入的密码不一致。" });
      return;
    }

    startTransition(async () => {
      const nextState = await createAccountAction(formData);
      setState(nextState);
      if (nextState.success) {
        form.reset();
        dialogRef.current?.close();
      }
    });
  }

  return (
    <>
      <button
        className="create-account-button"
        onClick={openDialog}
        type="button"
      >
        新增账号
      </button>
      <dialog className="account-dialog" ref={dialogRef}>
        <form className="dialog-form" onSubmit={handleSubmit}>
          <div className="dialog-heading">
            <h2>新增账号</h2>
            <p>新账号创建后默认启用。</p>
          </div>
          <label>
            登录用户名
            <input autoComplete="username" name="username" required />
          </label>
          {allowName ? (
            <label>
              账号名称
              <input name="name" required />
            </label>
          ) : null}
          <label>
            密码
            <input
              autoComplete="new-password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <label>
            确认密码
            <input
              autoComplete="new-password"
              minLength={8}
              name="confirmPassword"
              required
              type="password"
            />
          </label>
          <p className="form-hint">密码至少 8 位，并包含三类字符。</p>
          {state.error ? <p className="form-error">{state.error}</p> : null}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              取消
            </button>
            <button disabled={isPending} type="submit">
              {isPending ? "创建中…" : "创建账号"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function AccountStatusSwitch({
  active,
  userId,
  username,
}: {
  active: boolean;
  userId: string;
  username: string;
}) {
  const [isActive, setIsActive] = useState(active);
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextActive = event.target.checked;
    const formData = new FormData();
    formData.set("userId", userId);
    formData.set("active", String(nextActive));

    startTransition(async () => {
      const nextState = await updateAccountActiveAction(formData);
      setState(nextState);
      if (nextState.success) {
        setIsActive(nextActive);
      }
    });
  }

  return (
    <div className="status-control">
      <label className="switch">
        <input
          aria-label={`切换 ${username} 的启用状态`}
          checked={isActive}
          disabled={isPending}
          onChange={handleChange}
          type="checkbox"
        />
        <span className="switch-slider" />
      </label>
      <span
        className={
          isActive ? "status-text status-active" : "status-text status-inactive"
        }
      >
        {isActive ? "已启用" : "未启用"}
      </span>
      {state.error ? (
        <span className="status-error" role="alert">
          {state.error}
        </span>
      ) : null}
    </div>
  );
}

export function AccountActions({
  allowNameEdit = true,
  name,
  userId,
  username,
}: AccountActionsProps & { allowNameEdit?: boolean }) {
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const passwordDialogRef = useRef<HTMLDialogElement>(null);
  const [editState, setEditState] = useState(initialState);
  const [deleteState, setDeleteState] = useState(initialState);
  const [passwordState, setPasswordState] = useState(initialState);
  const [isEditPending, startEditTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isPasswordPending, startPasswordTransition] = useTransition();

  function openDialog(
    dialogRef: RefObject<HTMLDialogElement | null>,
    resetState: (state: AccountActionState) => void
  ) {
    resetState(initialState);
    dialogRef.current?.showModal();
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startEditTransition(async () => {
      const state = await updateAccountNameAction(formData);
      setEditState(state);
      if (state.success) {
        editDialogRef.current?.close();
      }
    });
  }

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startDeleteTransition(async () => {
      const state = await deleteAccountAction(formData);
      setDeleteState(state);
      if (state.success) {
        deleteDialogRef.current?.close();
      }
    });
  }

  function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const newPassword = formData.get("newPassword");
    const confirmPassword = formData.get("confirmPassword");

    if (newPassword !== confirmPassword) {
      setPasswordState({ error: "两次输入的新密码不一致。" });
      return;
    }

    startPasswordTransition(async () => {
      const state = await resetAccountPasswordAction(formData);
      setPasswordState(state);
      if (state.success) {
        form.reset();
        passwordDialogRef.current?.close();
      }
    });
  }

  return (
    <>
      <div className="account-actions">
        {allowNameEdit ? (
          <button
            className="text-button"
            onClick={() => openDialog(editDialogRef, setEditState)}
            type="button"
          >
            编辑
          </button>
        ) : null}
        <button
          className="text-button"
          onClick={() => openDialog(passwordDialogRef, setPasswordState)}
          type="button"
        >
          重置密码
        </button>
        <button
          className="danger-button text-button"
          onClick={() => openDialog(deleteDialogRef, setDeleteState)}
          type="button"
        >
          删除
        </button>
      </div>

      {allowNameEdit ? (
        <dialog className="account-dialog" ref={editDialogRef}>
          <form className="dialog-form" onSubmit={handleEditSubmit}>
            <input name="userId" type="hidden" value={userId} />
            <div className="dialog-heading">
              <h2>编辑账号</h2>
              <p>登录用户名不可修改。</p>
            </div>
            <label>
              登录用户名
              <input disabled value={username} />
            </label>
            <label>
              账号名称
              <input defaultValue={name} name="name" required />
            </label>
            {editState.error ? (
              <p className="form-error">{editState.error}</p>
            ) : null}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => editDialogRef.current?.close()}
                type="button"
              >
                取消
              </button>
              <button disabled={isEditPending} type="submit">
                {isEditPending ? "保存中…" : "保存"}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}

      <dialog className="account-dialog" ref={passwordDialogRef}>
        <form className="dialog-form" onSubmit={handlePasswordSubmit}>
          <input name="userId" type="hidden" value={userId} />
          <div className="dialog-heading">
            <h2>重置密码</h2>
            <p>将为 {username} 设置新密码。</p>
          </div>
          <label>
            新密码
            <input
              autoComplete="new-password"
              name="newPassword"
              required
              type="password"
            />
          </label>
          <label>
            确认新密码
            <input
              autoComplete="new-password"
              name="confirmPassword"
              required
              type="password"
            />
          </label>
          {passwordState.error ? (
            <p className="form-error">{passwordState.error}</p>
          ) : null}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => passwordDialogRef.current?.close()}
              type="button"
            >
              取消
            </button>
            <button disabled={isPasswordPending} type="submit">
              {isPasswordPending ? "重置中…" : "确认重置"}
            </button>
          </div>
        </form>
      </dialog>

      <dialog className="account-dialog" ref={deleteDialogRef}>
        <form className="dialog-form" onSubmit={handleDeleteSubmit}>
          <input name="userId" type="hidden" value={userId} />
          <div className="dialog-heading">
            <h2>删除账号</h2>
            <p>确定要删除账号“{username}”吗？此操作无法撤销。</p>
          </div>
          {deleteState.error ? (
            <p className="form-error">{deleteState.error}</p>
          ) : null}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              onClick={() => deleteDialogRef.current?.close()}
              type="button"
            >
              取消
            </button>
            <button
              className="danger-button"
              disabled={isDeletePending}
              type="submit"
            >
              {isDeletePending ? "删除中…" : "确认删除"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
