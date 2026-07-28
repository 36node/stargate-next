import {
  client,
  countNamespaces,
  countSessions,
  countUsers,
  createCaptcha,
  createNamespace,
  createSession,
  createUser,
  deleteCaptcha,
  deleteNamespace,
  deleteSession,
  deleteUser,
  getAuthorizer,
  getNamespace,
  getSession,
  getSessionByKey,
  getUser,
  listCaptchas,
  listNamespaces,
  listSessions,
  listUsers,
  login,
  loginByEmail,
  loginByOAuth,
  loginByPhone,
  loginByPhoneQuickAuth,
  logout,
  refresh,
  sendEmail,
  sendSms,
  signToken,
  updateNamespace,
  updatePassword,
  updateSession,
  updateUser,
  upsertUserById,
  upsertUserByPhone,
  upsertUserByUsername,
  verifyCaptcha,
  verifyIdentity,
} from "@36node/auth-sdk";

export type { SessionWithToken } from "@36node/auth-sdk";

import { env } from "../env";

// 初始化 auth client
client.setConfig({
  baseUrl: env.STARGATE_ENDPOINT,
  throwOnError: true,
  headers: {
    "x-api-key": env.STARGATE_API_KEY,
  },
});

// 添加请求拦截器（可选，用于调试请求）
// client.interceptors.request.use((requestConfig) => {
//   console.debug(
//     `[Auth Request] ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`
//   );
//   return requestConfig;
// });

// 添加响应错误拦截器
client.interceptors.response.use((response) => {
  // 如果响应成功，直接返回响应
  if (!response.ok) {
    console.error(
      `[Auth Response Error] ${response.status} ${response.statusText}`
    );
  }
  return response;
});

export const auth = {
  client,
  countSessions,
  countNamespaces,
  countUsers,
  createCaptcha,
  createNamespace,
  createSession,
  createUser,
  deleteCaptcha,
  deleteNamespace,
  deleteSession,
  deleteUser,
  getAuthorizer,
  getNamespace,
  getSession,
  getSessionByKey,
  getUser,
  listCaptchas,
  listNamespaces,
  listSessions,
  listUsers,
  login,
  loginByEmail,
  loginByOAuth,
  loginByPhone,
  loginByPhoneQuickAuth,
  logout,
  refresh,
  sendEmail,
  sendSms,
  signToken,
  updateNamespace,
  updatePassword,
  updateSession,
  updateUser,
  upsertUserById,
  upsertUserByPhone,
  upsertUserByUsername,
  verifyCaptcha,
  verifyIdentity,
};
