# NestJS Agent Chat API 技术开发文档

> **版本**: v2.0.0
> **更新时间**: 2026-06-04
> **作者**: 开发团队

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [项目结构](#3-项目结构)
4. [模块设计](#4-模块设计)
5. [接口文档](#5-接口文档)
6. [SSE 数据帧格式](#6-sse-数据帧格式)
7. [数据模型](#7-数据模型)
8. [核心代码实现](#8-核心代码实现)
9. [错误处理](#9-错误处理)
10. [配置说明](#10-配置说明)
11. [部署说明](#11-部署说明)

---

## 1. 项目概述

本项目是基于 **NestJS** 构建的后端服务，作为中间层对接基于 **Python LangChain** 框架暴露的 Agent API，向上游客户端提供统一、规范的会话管理与流式消息交互接口。

### 架构示意

```
Client (Browser / App)
        │
        ▼
  NestJS 后端服务（SSE 代理）
  (本文档描述范围)
        │  SSE 流式透传
        ▼
  Python FastAPI Agent 服务
  (底层 Agent 服务，SSE 源头)
```

### 核心设计

- **流式对话接口**采用 SSE（Server-Sent Events）协议，NestJS 直接透传下游 FastAPI 的 SSE 流，不做二次缓冲
- **会话管理接口**（创建 / 历史 / 删除）采用标准 REST JSON 响应
- 下游 FastAPI 服务的路由前缀为 `/agent`，本文档中 NestJS 路由前缀为 `/api/v1/agent`

---

## 1.1 SSE 流式对话完整流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Client (Browser / App)                             │
│                                                                             │
│  ① POST /api/v1/agent/chat   ──────────────────────────────────────────►   │
│     { query: "西红柿炒鸡蛋怎么做", session_id: "sess_001" }                 │
│                                                                             │
│  ⑦ 逐帧接收 SSE 数据                                                        │
│     ┌──────────────────────────────────────────────────────────────┐        │
│     │ data:{"type":"waiting","messages":"正在思考中..."}            │        │
│     │ data:{"type":"message","messages":"西红柿炒"}                │        │
│     │ data:{"type":"message","messages":"鸡蛋是一道"}              │        │
│     │ data:{"type":"message","messages":"经典家常菜"}              │        │
│     │ data:{"type":"done","messages":"","extra":{...}}             │        │
│     └──────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     NestJS 后端服务 (api/v1/agent)                          │
│                                                                             │
│  ┌─ Controller ──────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  ② 接收请求，DTO 校验 (query/session_id/image_url)                    │  │
│  │     ↓                                                                 │  │
│  │  ③ 调用 AgentService.getChatStream(chatDto)                           │  │
│  │     ↓                                                                 │  │
│  │  ⑥ 设置 SSE 响应头                                                     │  │
│  │     Content-Type: text/event-stream                                   │  │
│  │     Cache-Control: no-cache                                           │  │
│  │     X-Accel-Buffering: no                                             │  │
│  │     ↓                                                                 │  │
│  │  ⑧ stream.pipe(res)  ── 直接透传下游 SSE 流 ──────────────────────►   │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ Service ─────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  ④ 构造下游请求                                                        │  │
│  │     有 session_id → POST {baseUrl}/agent/chat/{session_id}            │  │
│  │     无 session_id → POST {baseUrl}/agent/chat                         │  │
│  │     body: { query, image_url?, session_id? }                          │  │
│  │     ↓                                                                 │  │
│  │  ⑤ axios.post(url, body, { responseType: 'stream' })                  │  │
│  │     返回 Node.js Readable Stream                                      │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │  SSE 流式透传 (pipe)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              Python FastAPI Agent 服务 (localhost:8001)                      │
│                                                                             │
│  ┌─ API 层 (chat_router.py) ─────────────────────────────────────────────┐  │
│  │  POST /agent/chat                                                     │  │
│  │  POST /agent/chat/{session_id}                                        │  │
│  │     ↓                                                                 │  │
│  │  StreamingResponse(sse_event_stream(...))                             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ SSE 生成器 ──────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  1. 发送 waiting 帧 → data:{"type":"waiting","messages":"正在思考..."} │  │
│  │     ↓                                                                 │  │
│  │  2. 调用 Service 层获取 LLM 流式生成器                                  │  │
│  │     ↓                                                                 │  │
│  │  3. 循环读取 LLM chunk                                                │  │
│  │     每个 chunk 按 CHUNK_SIZE=10 切片                                   │  │
│  │     每片封装为 message 帧 → data:{"type":"message","messages":"..."}   │  │
│  │     ↓                                                                 │  │
│  │  4. 流结束，提取 SessionMeta (intent/summary/artifacts/next_steps)     │  │
│  │     发送 done 帧 → data:{"type":"done","messages":"","extra":{...}}    │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ Service 层 (chat_service.py) ────────────────────────────────────────┐  │
│  │  get_chat_stream() → 调用 Agent 层 stream_generate()                   │  │
│  │  save_turn()       → 持久化本轮对话                                     │  │
│  │  build_meta()      → LLM 提取会话元数据                                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ Agent 层 (personal_cheif.py) ────────────────────────────────────────┐  │
│  │  stream_generate(prompt, thread_id, image_url)                         │  │
│  │     ↓                                                                  │  │
│  │  LangGraph Agent + Checkpointer (SQLite 持久化)                        │  │
│  │     ↓                                                                  │  │
│  │  Tavily 搜索工具 → 食谱检索                                            │  │
│  │     ↓                                                                  │  │
│  │  yield 逐 chunk 返回 LLM 回复文本                                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 流程步骤说明

| 步骤 | 层级 | 动作 | 说明 |
|------|------|------|------|
| ① | Client | 发送 POST 请求 | 携带 `query`、可选 `session_id` / `image_url` |
| ② | Controller | DTO 校验 | `class-validator` 自动校验，422 拦截非法输入 |
| ③ | Controller → Service | 调用 `getChatStream` | 传递校验后的 DTO |
| ④ | Service | 构造下游 URL | 根据有无 `session_id` 选择不同下游路由 |
| ⑤ | Service → FastAPI | axios 流式请求 | `responseType: 'stream'` 获取 Node.js Readable |
| ⑥ | Controller | 设置 SSE 响应头 | `text/event-stream` + 禁用缓冲 |
| ⑦ | Client | 逐帧接收 | 解析 `data:` 前缀，按 `type` 分发处理 |
| ⑧ | Controller → Client | `stream.pipe(res)` | 零拷贝透传，不做二次缓冲 |

### 会话管理流程（REST）

```
┌──────────┐         ┌───────────────┐         ┌─────────────────┐
│  Client  │  REST   │   NestJS      │  REST   │  FastAPI Agent  │
│          │  JSON   │   Controller  │  JSON   │  /agent/*       │
└────┬─────┘         └──────┬────────┘         └────────┬────────┘
     │                      │                           │
     │ POST /session        │                           │
     │─────────────────────►│  createSession()          │
     │                      │──────────────────────────►│
     │                      │  { session_id: "xxx" }    │
     │  { code:0, data:{}}  │◄──────────────────────────│
     │◄─────────────────────│                           │
     │                      │                           │
     │ GET /session/:id/    │                           │
     │   messages           │  getMessages(id)          │
     │─────────────────────►│──────────────────────────►│
     │  { code:0, data:{}}  │◄──────────────────────────│
     │◄─────────────────────│                           │
     │                      │                           │
     │ DELETE /session/:id  │                           │
     │─────────────────────►│  deleteSession(id)        │
     │                      │──────────────────────────►│
     │  { message:"..." }   │◄──────────────────────────│
     │◄─────────────────────│                           │
```

---

## 2. 技术栈

| 分类 | 技术 |
|------|------|
| 后端框架 | NestJS (Node.js) |
| 语言 | TypeScript |
| HTTP 客户端 | `@nestjs/axios` / `axios` / 原生 `fetch`（SSE 流代理） |
| 数据校验 | `class-validator` + `class-transformer` |
| 配置管理 | `@nestjs/config` |
| 文档生成 | `@nestjs/swagger` |
| 下游服务 | Python FastAPI Agent REST API（SSE 流式输出） |

---

## 3. 项目结构

```
src/
├── app.module.ts                 # 根模块
├── main.ts                       # 应用入口
├── config/
│   └── configuration.ts          # 配置工厂
├── common/
│   ├── dto/
│   │   └── api-response.dto.ts   # 通用响应 DTO
│   ├── filters/
│   │   └── http-exception.filter.ts  # 全局异常过滤器
│   └── interceptors/
│       └── transform.interceptor.ts  # 响应转换拦截器
└── agent/
    ├── agent.module.ts           # Agent 模块
    ├── agent.controller.ts       # 路由控制器（SSE + REST）
    ├── agent.service.ts          # 业务逻辑服务（流式代理 + REST 转发）
    ├── dto/
    │   └── chat.dto.ts           # 发送消息 DTO
    └── interfaces/
        └── chat.interface.ts     # SSE 帧 / 消息 / 会话接口定义
```

---

## 4. 模块设计

### 4.1 AgentModule

```typescript
// agent/agent.module.ts
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
  ],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
```

### 4.2 AgentService 职责

AgentService 封装所有与下游 Python Agent API 的通信逻辑，包括：

- **流式对话代理**：通过原生 `fetch` 获取下游 SSE 流，返回 `ReadableStream` 给 Controller
- 创建会话（REST 转发）
- 获取历史消息（REST 转发）
- 删除会话（REST 转发）

---

## 5. 接口文档

### 5.1 SSE 流式对话

**POST** `/api/v1/agent/chat`

向 Agent 发送消息，以 SSE 格式流式返回 LLM 回复。支持传入已有会话 ID 以延续上下文，若不传 `session_id`，下游 Agent 将自动创建新会话。

#### 请求头

```
Content-Type: application/json
```

#### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | `string` | ✅ | 用户输入内容（1-4096 字符） |
| `session_id` | `string` | ❌ | 会话 ID，不传则自动创建新会话 |
| `image_url` | `string` | ❌ | 图片 URL，支持多模态输入 |

**示例请求：**

```json
{
  "query": "我有西红柿和鸡蛋，能做什么菜？",
  "session_id": "sess_abc123"
}
```

#### 响应

响应类型为 `text/event-stream`，数据帧格式详见 [第六章 SSE 数据帧格式](#6-sse-数据帧格式)。

**完整 SSE 交互示例：**

```
data:{"type":"waiting","messages":"正在思考中...","extra":null}

data:{"type":"message","messages":"西红柿炒","extra":null}
data:{"type":"message","messages":"鸡蛋是一道","extra":null}
data:{"type":"message","messages":"经典家常菜","extra":null}
data:{"type":"message","messages":"，做法如下...","extra":null}

data:{"type":"done","messages":"","extra":{"intent":"根据食材推荐菜谱","summary":"用户提供了西红柿和鸡蛋，助手推荐了西红柿炒鸡蛋并给出了详细做法。","artifacts":["西红柿炒鸡蛋"],"next_steps":["查看详细步骤","询问其他食材搭配"]}}
```

---

### 5.2 创建新会话

**POST** `/api/v1/agent/session`

主动创建一个新的会话，返回新的 `session_id`。

#### 请求体

无需请求体。

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | `number` | 状态码，`0` 表示成功 |
| `data.session_id` | `string` | 新创建的会话 ID |

**示例响应：**

```json
{
  "code": 0,
  "data": {
    "session_id": "sess_xyz789"
  }
}
```

---

### 5.3 获取会话历史消息

**GET** `/api/v1/agent/session/:session_id/messages`

获取指定会话的全部历史消息列表，按时间顺序返回。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | `string` | ✅ | 会话 ID |

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | `number` | 状态码 |
| `data.messages` | `Message[]` | 消息列表 |

**Message 对象结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `role` | `"user" \| "assistant"` | 消息角色 |
| `content` | `string` | 消息内容 |

**示例响应：**

```json
{
  "code": 0,
  "data": {
    "messages": [
      {
        "role": "user",
        "content": "我有西红柿和鸡蛋"
      },
      {
        "role": "assistant",
        "content": "西红柿炒鸡蛋是一道经典家常菜..."
      }
    ]
  }
}
```

---

### 5.4 删除会话

**DELETE** `/api/v1/agent/session/:session_id`

删除指定会话及其全部历史消息，操作不可逆。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | `string` | ✅ | 会话 ID |

**示例响应：**

```json
{
  "code": 0,
  "data": {
    "message": "会话已成功删除"
  }
}
```

---

## 6. SSE 数据帧格式

### 6.1 帧结构

所有 SSE 数据帧统一使用 JSON 格式，包含 `type`、`messages` 以及可选的 `extra` 字段：

```typescript
interface SSEFrame {
  type: "waiting" | "message" | "done" | "error";
  messages: string;
  extra?: SessionMeta | null;   // 会话元数据，仅 done 帧携带
}
```

### 6.2 type 枚举说明

| type | 含义 | messages 内容 | extra |
|------|------|--------------|-------|
| `waiting` | Agent 正在处理，等待首 token 返回 | 提示文本，如 `"正在思考中..."` | `null` |
| `message` | LLM 流式输出的文本片段 | LLM 生成的一小段文本 | `null` |
| `done` | 流式输出结束 | `""`（空字符串） | `SessionMeta` |
| `error` | 发生错误 | 错误描述信息 | `null` |

### 6.3 硬性规则

- `message` 帧的 `messages` 字段**只包含 AI 回答正文**，严禁拼入任何元数据
- `extra`（`SessionMeta`）**仅允许出现在 `done` 帧**中，对话结束后一次性返回
- `waiting` / `message` / `error` 帧中 `extra` 为 `null`
- 流结束时由 `done` 帧作为终止信号

### 6.4 SessionMeta 结构

```typescript
interface SessionMeta {
  intent: string;        // 用户意图 / 本次对话目的
  summary: string;       // 本轮对话摘要
  artifacts: string[];   // 产出物列表，如食谱名称、食材清单等
  next_steps: string[];  // 建议的后续操作
}
```

---

## 7. 数据模型

### 7.1 DTO 定义

```typescript
// dto/chat.dto.ts
import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  query: string;

  @IsString()
  @IsOptional()
  session_id?: string;

  @IsString()
  @IsOptional()
  image_url?: string;
}
```

### 7.2 接口定义

```typescript
// interfaces/chat.interface.ts
export enum SSEFrameType {
  WAITING = 'waiting',
  MESSAGE = 'message',
  DONE = 'done',
  ERROR = 'error',
}

export interface SessionMeta {
  intent: string;
  summary: string;
  artifacts: string[];
  next_steps: string[];
}

export interface SSEFrame {
  type: SSEFrameType;
  messages: string;
  extra?: SessionMeta | null;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionMessagesResponse {
  messages: Message[];
}

export interface CreateSessionResponse {
  session_id: string;
}
```

---

## 8. 核心代码实现

### 8.1 Controller

```typescript
// agent/agent.controller.ts
import {
  Controller, Post, Get, Delete,
  Body, Param, HttpCode, HttpStatus, Res, Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AgentService } from './agent.service';
import { ChatDto } from './dto/chat.dto';

@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);
  constructor(private readonly agentService: AgentService) {}

  /** SSE 流式对话 */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() chatDto: ChatDto, @Res() res: Response) {
    const stream = await this.agentService.getChatStream(chatDto);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      this.logger.error(`SSE 流转发异常: ${error}`);
    } finally {
      res.end();
    }
  }

  /** 创建新会话 */
  @Post('session')
  async createSession() {
    return this.agentService.createSession();
  }

  /** 获取会话历史消息 */
  @Get('session/:session_id/messages')
  async getMessages(@Param('session_id') sessionId: string) {
    return this.agentService.getMessages(sessionId);
  }

  /** 删除会话 */
  @Delete('session/:session_id')
  async deleteSession(@Param('session_id') sessionId: string) {
    await this.agentService.deleteSession(sessionId);
    return { message: '会话已成功删除' };
  }
}
```

### 8.2 Service

```typescript
// agent/agent.service.ts
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ChatDto } from './dto/chat.dto';
import { CreateSessionResponse, SessionMessagesResponse } from './interfaces/chat.interface';

@Injectable()
export class AgentService {
  private readonly baseUrl: string;
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('langchainApiBaseUrl', 'http://localhost:8000');
  }

  /** 获取下游 SSE 流式响应的 ReadableStream */
  async getChatStream(chatDto: ChatDto): Promise<ReadableStream<Uint8Array>> {
    const url = chatDto.session_id
      ? `${this.baseUrl}/agent/chat/${chatDto.session_id}`
      : `${this.baseUrl}/agent/chat`;

    const body: Record<string, string> = { query: chatDto.query };
    if (chatDto.image_url) body.image_url = chatDto.image_url;
    if (chatDto.session_id) body.session_id = chatDto.session_id;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new HttpException(
        { code: response.status, message: '下游服务错误' },
        response.status,
      );
    }

    return response.body!;
  }

  /** 创建新会话 */
  async createSession(): Promise<CreateSessionResponse> { ... }

  /** 获取会话历史 */
  async getMessages(sessionId: string): Promise<SessionMessagesResponse> { ... }

  /** 删除会话 */
  async deleteSession(sessionId: string): Promise<void> { ... }
}
```

---

## 9. 错误处理

### 9.1 SSE 流中的错误

当流式对话过程中发生错误时，下游 API 会在 SSE 流中发送 `error` 帧：

```
data:{"type":"error","messages":"LLM 调用失败: timeout","extra":null}
```

客户端应监听 `error` 类型帧并做相应处理。

### 9.2 REST 接口错误响应

```json
{
  "code": 400,
  "message": "参数校验失败：query 不能为空"
}
```

### 9.3 常见错误码

| HTTP 状态码 | 说明 |
|------------|------|
| `400` | 请求参数校验失败 |
| `404` | 会话不存在 |
| `422` | 请求体格式错误（Pydantic 校验失败） |
| `500` | 服务内部错误 / 下游服务异常 |
| `502` | 无法连接到 Agent 服务 |
| `504` | 下游服务响应超时 |

---

## 10. 配置说明

### 10.1 环境变量

在项目根目录创建 `.env` 文件：

```env
# 下游 Agent API 地址
LANGCHAIN_API_BASE_URL=http://localhost:8000

# NestJS 监听端口
PORT=3000
```

### 10.2 请求超时配置

在 `AgentModule` 中配置 `HttpModule` 超时：

```typescript
HttpModule.register({
  timeout: 30000,       // 30 秒超时（REST 接口）
  maxRedirects: 3,
}),
```

> **注意**：SSE 流式接口使用原生 `fetch`，不受 `HttpModule` 超时限制。下游 SSE 流的超时由 Nginx `proxy_read_timeout` 控制。

---

## 11. 部署说明

### 11.1 安装依赖

```bash
npm install
npm install @nestjs/axios axios @nestjs/config class-validator class-transformer
```

### 11.2 本地开发

```bash
npm run start:dev
```

### 11.3 生产构建

```bash
npm run build
npm run start:prod
```

### 11.4 Nginx 配置（SSE 关键）

```nginx
location /api/v1/agent/chat {
    proxy_pass         http://127.0.0.1:3000;
    proxy_buffering    off;           # 必须关闭，否则 SSE 被缓冲
    proxy_cache        off;
    proxy_read_timeout 300s;          # 流式接口需要更长超时
    proxy_set_header   X-Accel-Buffering no;
    proxy_http_version 1.1;
    proxy_set_header   Connection "";
}
```

### 11.5 接口验证（curl 示例）

```bash
# SSE 流式对话
curl -N -X POST http://localhost:3000/api/v1/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "你好", "session_id": "sess_001"}'

# 创建会话
curl -X POST http://localhost:3000/api/v1/agent/session

# 获取历史消息
curl http://localhost:3000/api/v1/agent/session/sess_001/messages

# 删除会话
curl -X DELETE http://localhost:3000/api/v1/agent/session/sess_001
```

### 11.6 客户端接入示例（JavaScript）

```javascript
async function chatStream(query, sessionId = null) {
  const resp = await fetch('/api/v1/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, session_id: sessionId }),
  });

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data:')) {
        const frame = JSON.parse(line.slice(5));
        switch (frame.type) {
          case 'waiting':
            console.log('[等待中]', frame.messages);
            break;
          case 'message':
            process.stdout.write(frame.messages);
            break;
          case 'done':
            console.log('\n元数据:', frame.extra);
            return;
          case 'error':
            console.error('[错误]', frame.messages);
            return;
        }
      }
    }
  }
}
```

---

## 12. 接口对照表

| NestJS 接口 | 方法 | 下游 FastAPI 接口 | 说明 |
|------------|------|------------------|------|
| `/api/v1/agent/chat` | POST | `/agent/chat` 或 `/agent/chat/{session_id}` | SSE 流式透传 |
| `/api/v1/agent/session` | POST | `/agent/session` | 创建会话 |
| `/api/v1/agent/session/:id/messages` | GET | `/agent/history/:id` | 获取历史 |
| `/api/v1/agent/session/:id` | DELETE | `/agent/session/delete/:id` | 删除会话 |

---

*文档结束*
