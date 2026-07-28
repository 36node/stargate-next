import { auth } from "@repo/services/auth/client";
import { env } from "@repo/services/env";
import { StargateNextClient } from "@repo/stargate-next-sdk";

import { authBackendLabel } from "../../../auth-backend";
import {
  AccountActions,
  AccountStatusSwitch,
  CreateAccountButton,
} from "./account-actions";

type Account = {
  active?: boolean;
  id?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  username?: string;
};

export default async function AccountsPage() {
  try {
    const users =
      env.STARGATE_AUTH_BACKEND === "next"
        ? (
            await new StargateNextClient(env.STARGATE_ENDPOINT, {
              apiKey: env.STARGATE_API_KEY,
            }).listAccounts()
          ).data.map((resource) => resource.attributes)
        : ((
            await auth.listUsers({
              query: { _limit: 100 },
            })
          ).data ?? []);

    return (
      <section className="accounts-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">{authBackendLabel}</p>
            <h1>账号管理</h1>
          </div>
          <div className="page-heading-actions">
            <p>查看并管理登录账号。</p>
            <CreateAccountButton
              allowName={env.STARGATE_AUTH_BACKEND !== "next"}
            />
          </div>
        </div>

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
