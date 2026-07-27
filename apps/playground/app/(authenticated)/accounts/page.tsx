import { auth } from "@repo/services/auth/client";

import {
  AccountActions,
  AccountStatusSwitch,
  CreateAccountButton,
} from "./account-actions";

type Account = {
  active?: boolean;
  id?: string;
  name?: string;
  username?: string;
};

export default async function AccountsPage() {
  try {
    const { data: users = [] } = await auth.listUsers({
      query: { _limit: 100 },
    });

    return (
      <section className="accounts-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Stargate Legacy</p>
            <h1>账号管理</h1>
          </div>
          <div className="page-heading-actions">
            <p>查看并管理旧 Stargate 中的登录账号。</p>
            <CreateAccountButton />
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
                      <td>{user.name || "—"}</td>
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
            <p className="eyebrow">Stargate Legacy</p>
            <h1>账号管理</h1>
          </div>
        </div>
        <p className="form-error">
          无法加载账号列表，请检查 legacy Stargate 服务和环境配置。
        </p>
      </section>
    );
  }
}
