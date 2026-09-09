import { StargateNextClient } from "@36node/stargate-next-sdk";
import Link from "next/link";

import { auth } from "@/packages/services/auth/client";
import { env } from "@/packages/services/env";
import { authBackendLabel } from "../../../auth-backend";
import { ensureSession } from "../../../stargate";
import {
  AccountActions,
  AccountStatusSwitch,
  CreateAccountButton,
  SelfChangePasswordForm,
} from "./account-actions";

type Account = {
  active?: boolean;
  id?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  username?: string;
};

const PAGE_SIZE = 10;

function pageNumber(value: string | string[] | undefined): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

type AccountsPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function AccountsPage({
  searchParams,
}: AccountsPageProps) {
  const session = await ensureSession();
  try {
    const requestedPage = pageNumber((await searchParams).page);
    const offset = (requestedPage - 1) * PAGE_SIZE;
    let total = 0;
    let users: Account[] = [];

    if (env.STARGATE_AUTH_BACKEND === "next") {
      const accounts = await new StargateNextClient(env.STARGATE_ENDPOINT, {
        apiKey: env.STARGATE_API_KEY,
      }).listAccounts(offset, PAGE_SIZE);
      total = accounts.meta.page?.total ?? accounts.data.length;
      users = accounts.data.map((resource) => resource.attributes);
    } else {
      const allUsers =
        (await auth.listUsers({ query: { _limit: 100 } })).data ?? [];
      total = allUsers.length;
      users = allUsers.slice(offset, offset + PAGE_SIZE);
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const previousPage = requestedPage - 1;
    const nextPage = requestedPage + 1;

    return (
      <section className="accounts-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{authBackendLabel}</p>
            <h1>账号管理</h1>
            {env.STARGATE_AUTH_BACKEND === "next" ? (
              <>
                <p>当前管理：default 租户</p>
                {session.tenantId && session.tenantId !== "default" ? (
                  <p>
                    当前登录租户为 {session.tenantId}；本页不管理该租户账号。
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="page-heading-actions">
            <p>查看并管理登录账号。</p>
            <CreateAccountButton
              allowName={env.STARGATE_AUTH_BACKEND !== "next"}
            />
          </div>
        </div>

        {env.STARGATE_AUTH_BACKEND === "next" ? (
          <SelfChangePasswordForm />
        ) : null}

        {users.length === 0 ? (
          <p className="empty-state">当前没有账号。</p>
        ) : (
          <div className="table-wrapper">
            <table className="accounts-table">
              <thead>
                <tr>
                  <th scope="col">登录用户名</th>
                  <th scope="col">账号名称</th>
                  <th scope="col">启用状态</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {(users as Account[]).map((user) => {
                  const userId = user.id;

                  return (
                    <tr key={userId ?? user.username}>
                      <td>{user.username || "—"}</td>
                      <td>{user.name || user.phone || user.email || "—"}</td>
                      <td>
                        {userId ? (
                          <AccountStatusSwitch
                            active={Boolean(user.active)}
                            userId={userId}
                            username={user.username ?? "该账号"}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {userId ? (
                          <AccountActions
                            allowNameEdit={env.STARGATE_AUTH_BACKEND !== "next"}
                            name={user.name ?? ""}
                            userId={userId}
                            username={user.username ?? "—"}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <nav aria-label="账号列表分页" className="accounts-pagination">
            <span className="accounts-pagination-summary">
              共 {total} 个账号，第 {requestedPage} / {totalPages} 页
            </span>
            <div className="accounts-pagination-actions">
              {previousPage > 0 ? (
                <Link href={`/accounts?page=${previousPage}`}>上一页</Link>
              ) : (
                <span aria-disabled="true">上一页</span>
              )}
              {requestedPage < totalPages ? (
                <Link href={`/accounts?page=${nextPage}`}>下一页</Link>
              ) : (
                <span aria-disabled="true">下一页</span>
              )}
            </div>
          </nav>
        )}
      </section>
    );
  } catch {
    return (
      <section className="accounts-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{authBackendLabel}</p>
            <h1>账号管理</h1>
          </div>
        </div>
        <p className="form-error">
          无法加载账号列表，请检查 {authBackendLabel} 服务和环境配置。
        </p>
      </section>
    );
  }
}
