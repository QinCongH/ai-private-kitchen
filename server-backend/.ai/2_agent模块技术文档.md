# NestJS Agent Chat API 技术开发文档

> **版本**: v1.0.0
> **更新时间**: 2026-06-01
> **作者**: 开发团队

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [项目结构](#3-项目结构)
4. [模块设计](#4-模块设计)
5. [接口文档](#5-接口文档)
6. [数据模型](#6-数据模型)
7. [核心代码实现](#7-核心代码实现)
8. [错误处理](#8-错误处理)
9. [配置说明](#9-配置说明)
10. [部署说明](#10-部署说明)

---

## 1. 项目概述

本项目是基于 **NestJS** 构建的后端服务，作为中间层对接基于 **Python LangChain** 框架暴露的 Agent API，向上游客户端提供统一、规范的会话管理与消息交互接口。

### 架构示意

```
Client (Browser / App)
        │
        ▼
  NestJS 后端服务
  (本文档描述范围)
        │
        ▼
  Python LangChain API
  (底层 Agent 服务)
```

---

## 2. 技术栈

| 分类 | 技术 |
|------|------|
| 后端框架 | NestJS (Node.js) |
| 语言 | TypeScript |
| HTTP 客户端 | `@nestjs/axios` / `axios` |
| 数据校验 | `class-validator` + `class-transformer` |
| 配置管理 | `@nestjs/config` |
| 文档生成 | `@nestjs/swagger` (可选) |
| 下游服务 | Python LangChain REST API |

---

## 3. 项目结构

```
src/
├── app.module.ts                 # 根模块
├── main.ts                       # 应用入口
└── agent/
    ├── agent.module.ts           # Agent 模块
    ├── agent.controller.ts       # 路由控制器
    ├── agent.service.ts          # 业务逻辑服务
    ├── dto/
    │   ├── chat.dto.ts           # 发送消息 DTO
    │   └── session.dto.ts        # 会话相关 DTO
    └── interfaces/
        ├── chat.interface.ts     # 消息接口定义
        └── session.interface.ts  # 会话接口定义
```

---

## 4. 模块设计

### 4.1 AgentModule

```typescript
// agent/agent.module.ts
@Module({
  imports: [HttpModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
```

### 4.2 AgentService 职责

AgentService 封装所有与下游 Python LangChain API 的通信逻辑，包括：

- 转发消息请求
- 创建会话
- 获取历史消息
- 删除会话

---

## 5. 接口文档

### 5.1 发送消息

**POST** `/api/agent/chat`

向 Agent 发送消息，支持传入已有会话 ID 以延续上下文。若不传 `session_id`，Agent 将自动创建新会话。

#### 请求头

```
Content-Type: application/json
```

#### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | ✅ | 用户发送的消息内容 |
| `session_id` | `string` | ❌ | 会话 ID，不传则创建新会话 |

**示例请求：**

```json
{
  "message": "请帮我分析这段代码的性能问题",
  "session_id": "sess_abc123"
}
```

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | `number` | 状态码，`0` 表示成功 |
| `data.reply` | `string` | Agent 返回的回复内容 |
| `data.session_id` | `string` | 当前会话 ID |

**示例响应：**

```json
{
  "code": 0,
  "data": {
    "reply": "根据您提供的代码，我发现以下性能问题...",
    "session_id": "sess_abc123"
  }
}
```

---

### 5.2 创建新会话

**POST** `/api/agent/session`

主动创建一个新的会话，返回新的 `session_id`，后续消息可携带该 ID 保持上下文连续性。

#### 请求体

无需请求体。

#### 响应体

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | `number` | 状态码 |
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

**GET** `/api/agent/session/:session_id/messages`

获取指定会话的全部历史消息列表，按时间顺序返回。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | `string` | ✅ | 会话 ID |

**示例请求：**

```
GET /api/agent/session/sess_abc123/messages
```

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
| `timestamp` | `string` | 消息时间（ISO 8601）|

**示例响应：**

```json
{
  "code": 0,
  "data": {
    "messages": [
      {
        "role": "user",
        "content": "你好",
        "timestamp": "2026-06-01T08:00:00.000Z"
      },
      {
        "role": "assistant",
        "content": "你好！有什么我可以帮您的？",
        "timestamp": "2026-06-01T08:00:01.200Z"
      }
    ]
  }
}
```

---

### 5.4 清空 / 删除会话

**DELETE** `/api/agent/session/:session_id`

删除指定会话及其全部历史消息，操作不可逆。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | `string` | ✅ | 会话 ID |

**示例请求：**

```
DELETE /api/agent/session/sess_abc123
```

#### 响应体

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

## 6. 数据模型

### 6.1 DTO 定义

```typescript
// dto/chat.dto.ts
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  session_id?: string;
}
```

```typescript
// interfaces/chat.interface.ts
export interface ChatResponse {
  reply: string;
  session_id: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface SessionMessagesResponse {
  messages: Message[];
}
```

---

## 7. 核心代码实现

### 7.1 Controller

```typescript
// agent/agent.controller.ts
import {
  Controller, Post, Get, Delete,
  Body, Param, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AgentService } from './agent.service';
import { ChatDto } from './dto/chat.dto';

@Controller('api/agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /** 发送消息 */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() chatDto: ChatDto) {
    const data = await this.agentService.chat(chatDto);
    return { code: 0, data };
  }

  /** 创建新会话 */
  @Post('session')
  async createSession() {
    const data = await this.agentService.createSession();
    return { code: 0, data };
  }

  /** 获取会话历史消息 */
  @Get('session/:session_id/messages')
  async getMessages(@Param('session_id') sessionId: string) {
    const data = await this.agentService.getMessages(sessionId);
    return { code: 0, data };
  }

  /** 删除会话 */
  @Delete('session/:session_id')
  async deleteSession(@Param('session_id') sessionId: string) {
    await this.agentService.deleteSession(sessionId);
    return { code: 0, data: { message: '会话已成功删除' } };
  }
}
```

### 7.2 Service

```typescript
// agent/agent.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ChatDto } from './dto/chat.dto';
import { ChatResponse, SessionMessagesResponse } from './interfaces/chat.interface';

@Injectable()
export class AgentService {
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('LANGCHAIN_API_BASE_URL');
  }

  /** 发送消息到 LangChain Agent */
  async chat(chatDto: ChatDto): Promise<ChatResponse> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/agent/chat`, chatDto),
      );
      return data;
    } catch (error) {
      this.handleError(error, '消息发送失败');
    }
  }

  /** 创建新会话 */
  async createSession(): Promise<{ session_id: string }> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/agent/session`),
      );
      return data;
    } catch (error) {
      this.handleError(error, '创建会话失败');
    }
  }

  /** 获取会话历史 */
  async getMessages(sessionId: string): Promise<SessionMessagesResponse> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/agent/session/${sessionId}/messages`,
        ),
      );
      return data;
    } catch (error) {
      this.handleError(error, '获取消息历史失败');
    }
  }

  /** 删除会话 */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.baseUrl}/api/agent/session/${sessionId}`,
        ),
      );
    } catch (error) {
      this.handleError(error, '删除会话失败');
    }
  }

  /** 统一错误处理 */
  private handleError(error: any, message: string): never {
    const status = error?.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const detail = error?.response?.data?.message ?? message;
    throw new HttpException({ code: status, message: detail }, status);
  }
}
```

---

## 8. 错误处理

### 8.1 统一错误响应格式

```json
{
  "code": 400,
  "message": "参数校验失败：message 不能为空"
}
```

### 8.2 常见错误码

| HTTP 状态码 | 说明 |
|------------|------|
| `400` | 请求参数校验失败 |
| `404` | 会话不存在 |
| `500` | 服务内部错误 / 下游服务异常 |
| `502` | 无法连接到 LangChain API |
| `504` | 下游服务响应超时 |

### 8.3 全局异常过滤器（可选增强）

```typescript
// common/filters/http-exception.filter.ts
import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException,
} from '@nestjs/common';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    response.status(status).json({
      code: status,
      message: exceptionResponse.message ?? '服务异常，请稍后再试',
      timestamp: new Date().toISOString(),
    });
  }
}
```

在 `main.ts` 中注册：

```typescript
app.useGlobalFilters(new HttpExceptionFilter());
```

---

## 9. 配置说明

### 9.1 环境变量

在项目根目录创建 `.env` 文件：

```env
# 下游 LangChain API 地址
LANGCHAIN_API_BASE_URL=http://localhost:8000

# NestJS 监听端口
PORT=3000
```

### 9.2 请求超时配置

在 `AgentModule` 中配置 `HttpModule` 超时：

```typescript
HttpModule.register({
  timeout: 30000,       // 30 秒超时
  maxRedirects: 3,
}),
```

---

## 10. 部署说明

### 10.1 安装依赖

```bash
npm install
npm install @nestjs/axios axios @nestjs/config class-validator class-transformer
```

### 10.2 本地开发

```bash
npm run start:dev
```

### 10.3 生产构建

```bash
npm run build
npm run start:prod
```

### 10.4 接口验证（curl 示例）

```bash
# 发送消息
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "session_id": "sess_001"}'

# 创建会话
curl -X POST http://localhost:3000/api/agent/session

# 获取历史消息
curl http://localhost:3000/api/agent/session/sess_001/messages

# 删除会话
curl -X DELETE http://localhost:3000/api/agent/session/sess_001
```

---

*文档结束*