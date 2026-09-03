# Agent Note: 宿主成为客户端无关的 API 面

Status: implemented

[English](2026-09-01-api-client-agnostic-surface.md) | 中文

## Problem

合并后的 0.1.2 传输层已经是协议优先——所有业务调用都走带 zod 校验的 Typert 信封 `POST /api`,事件流由 `remote.mux` WebSocket 承载——但有三个缺口让第三方客户端无法对话一个运行中的宿主:跨源浏览器调用不可能(完全没有 CORS,cookie 是 `SameSite=Strict`);非浏览器客户端没有鉴权途径(launch token 只在 `GET /?token=` 换 cookie 的单次交换里有效);可调用面没有任何描述(契约活在生成 TypeScript 里,外来客户端读不了)。客户端与旧宿主的协议不匹配也会在载荷校验深处失败,而不是报出版本号。

## Decision

- **CORS 是 webserver 的显式白名单。** `dsh-host-webserver` 的 `corsOrigins: string[]`(默认空,行为零变化):匹配的源获得精确源的 `Access-Control-Allow-Origin` 加 `Allow-Credentials` 与 `Vary: Origin`;`OPTIONS` 预检以 204 应答并放行 API 所需的方法与头;`Origin` 不在白名单的 WebSocket upgrade 被拒绝。浏览器仍是执行点——其它或缺失的源原样通过,非浏览器客户端不受影响。
- **launch token 成为非浏览器一等凭据。** `BrowserAuth.verifyLaunchToken` 是常量时间比较,经 `requestRejection` 暴露:HTTP 客户端发 `Authorization: Bearer <token>`,WebSocket upgrade(浏览器无法设 upgrade 头)接受 `?token=` 查询参数。两者与 cookie 路径并存,cookie 路径不变;错误 token 仍然落到 401。
- **ready 帧携带线路协议版本。** `RemoteEventHostInfo` 增加 `protocolVersion`(共享常量 `REMOTE_PROTOCOL_VERSION`);宿主在 API Remotes 注册处填入,客户端 `parseRemoteEventReady` 对不匹配值抛出明确报错并同时报出两个版本号。增量的可选帧字段保持常量不变;破坏性帧变化才提升它。
- **契约被服务出来,而不仅是被生成。** `GET /api/$schema` 返回协议版本、RPC 路径形态、mux 路径,以及按命名空间分组的全部本地注册调用(wire 参数名、JSON 或 lookup 来源、稳定类型符号)——缓存到本地注册表变化为止。`scripts/api-only-smoke.mjs` 在无浏览器条件下证明整个面:启动真实 `dsh --profile web`,Bearer 鉴权,用 schema 自己的参数名构造一次 RPC 调用,断言 mux ready 帧的协议版本。

## Alternatives considered

**非浏览器客户端沿用 cookie。** 签名 cookie 已存在且跨重启有效。被否:`SameSite=Strict` 使其跨源不可用;铸造它要抓取根交换;非浏览器客户端(CLI、移动端、测试)不该为调 API 模拟浏览器的 cookie 罐。

**`$schema` 输出 JSON Schema。** zod 4 可以产出 JSON Schema,比类型符号更可直接生成代码。暂缓:lookup 参数与 Context 适配器没有 JSON 形态,而描述符文档(wire 名、来源、类型符号)已足以对着运行中的宿主写客户端;JSON-Schema 层可以在同一端点上无破坏地追加。

**专门的版本协商握手消息。** 独立的 hello/acknowledge 交换可承载能力集。被否:ready 帧本来就开启每一代连接,把版本放在那里让不匹配检测零额外往返;能力协议之后可以骑同一字段。

## Consequences

第三方客户端现在只用 HTTP 和一条 WebSocket 就能对话运行中的宿主:用 Bearer token 取 `/api/$schema`,调 `POST /api/<namespace>/<method>`,开 `remote.mux?token=` 收事件。跨源浏览器客户端部署时给 webserver 配 `corsOrigins` 并反向代理 TLS。版本字段是精确匹配(不是区间),所以跨版本的客户端按代固定版本;在协议尚年轻时可以接受。`$schema` 文档描述本地注册表,实验性组合如实上报它们服务的东西。`corsOrigins` 为空(所有出厂组合的默认)时,cookie 行为、trusted-host 围栏与同源流程逐字节不变。
