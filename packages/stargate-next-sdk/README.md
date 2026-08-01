# Stargate Next SDK

此包用于预留从 Stargate Next OpenAPI 契约生成的 API 绑定。

## 刷新凭据

调用 `refresh` 成功后，客户端必须用响应中的 `refreshKey` 覆盖本地保存的值，并在下一次刷新时提交该值。当前服务可能返回原 refresh key，但客户端不应依赖这一行为；接口允许服务后续在每次刷新时轮换 refresh key。
