import type { JWTPayload } from "jose";

export type JwtVerifyConfig =
  | { algorithm: "HS256"; secret: string }
  | { algorithm: "RS256"; publicKey: string }
  | { algorithm: "ES256"; publicKey: string };

export type TokenPayload = JWTPayload & {
  sub: string;
  sid: string;
  source?: string;
  type?: string;
  ns?: string;
  groups?: string[];
  permissions?: string[];
  roles?: string[];
};

export type Session = {
  subject: string;
  source?: string;
  permissions?: string[];
  roles?: string[];
  groups?: string[];
  ns?: string;
  type?: string;
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
};

export type SessionWithToken = Session & {
  token: string;
  tokenExpireAt: Date;
  key: string;
  expireAt: Date;
};

export type Provider = {
  name: string;
  callbackUrl: string;
  grantType?: string;
  responseType?: string;
  scope?: string;
};

export type SignInCredential = {
  captchaCode?: string;
  captchaId?: string;
  login: string;
  password: string;
};
export type SignInProvider = string;
export type SignInParams = SignInCredential | SignInProvider;
export type SignInState = {
  from?: string;
  [key: string]: unknown;
};

export type AuthLoginParams = {
  body: {
    login: string;
    password: string;
    captchaId?: string;
    captchaCode?: string;
  };
};

export type AuthLoginResponse = {
  data: SessionWithToken;
  request: Request;
  response: Response;
};

export type AuthGetAuthorizerParams = {
  query: {
    provider: string;
    redirectUri: string;
    responseType?: string;
    state?: string;
  };
};

export type AuthGetAuthorizerResponse = {
  data: {
    url: string;
  };
  request: Request;
  response: Response;
};

export type AuthGetSessionByKeyParams = {
  path: {
    key: string;
  };
};

export type AuthGetSessionByKeyResponse = {
  data: Session;
  request: Request;
  response: Response;
};

export type AuthRefreshParams = {
  body: {
    refreshToken: string;
  };
};

export type AuthRefreshResponse = {
  data: SessionWithToken;
  request: Request;
  response: Response;
};

export type AuthLogoutParams = {
  body: {
    sid: string;
    token?: string;
  };
};

export type AuthLogoutResponse = unknown;

export type AuthLoginByOAuthParams = {
  body: {
    provider: string;
    code: string;
    redirectUri: string;
    grantType?: string;
  };
};

export type AuthLoginByOAuthResponse = {
  data: SessionWithToken;
  request: Request;
  response: Response;
};

export type AuthService = {
  login(params: AuthLoginParams): Promise<AuthLoginResponse>;
  getAuthorizer(
    params: AuthGetAuthorizerParams
  ): Promise<AuthGetAuthorizerResponse>;
  getSessionByKey(
    params: AuthGetSessionByKeyParams
  ): Promise<AuthGetSessionByKeyResponse>;
  refresh(params: AuthRefreshParams): Promise<AuthRefreshResponse>;
  logout(params: AuthLogoutParams): Promise<AuthLogoutResponse>;
  loginByOAuth(
    params: AuthLoginByOAuthParams
  ): Promise<AuthLoginByOAuthResponse>;
};
