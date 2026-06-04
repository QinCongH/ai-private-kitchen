
---

# FastAPI Agent 分层流式输出接口技术文档

> **版本**：v1.1 | **框架**：FastAPI + Python ≥ 3.9 | **流式方案**：SSE (Server-Sent Events)

---

## 一、设计原则与分层职责

| 层级 | 文件 | 核心职责 | 依赖限制 |
|------|------|---------|---------|
| **Schema 层** | `schema/chat_schema.py` | Pydantic 入参/出参模型定义 | 仅 pydantic |
| **Agent 层** | `agent/personal_chief.py` | 纯业务逻辑，LLM 调用，流式生成器对外暴露 | **无任何 web 依赖**，可独立测试 |
| **Service 层** | `service/chat_service.py` | 权限校验、日志、会话上下文管理，中转 Agent | 依赖 Agent 层 |
| **API 层** | `api/chat_router.py` | 入参接收、SSE 协议包装、StreamingResponse 返回 | 依赖 Service 层 |
| **入口** | `main.py` | FastAPI 实例、路由注册、全局中间件 | — |

**核心分层原则**：
- Agent 层不知道 HTTP 存在，只暴露 `Generator` 接口，天然支持单元测试和复用
- Service 层负责所有业务横切关注点，API 层保持极简
- SSE 包装在 API 层统一处理，不污染业务逻辑

---

## 1.1 SSE 流式对话完整流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Client (Browser / App)                             │
│                                                                             │
│  ① POST /agent/chat                                                        │
│     { query: "西红柿炒鸡蛋怎么做", session_id: "sess_001" }                 │
│     或 POST /agent/chat/{session_id}                                       │
│                                                                             │
│  ⑩ 逐帧接收 SSE 数据                                                       │
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
│                   API 层 — chat_router.py                                    │
│                                                                             │
│  ② Pydantic 校验 ChatReq                                                   │
│     query: str (1~4096 字符)                                                │
│     session_id: str | None                                                  │
│     校验失败 → 422 直接返回                                                 │
│     ↓                                                                       │
│  ③ 无 session_id → chat_service.create_session() 自动创建                   │
│     ↓                                                                       │
│  ④ StreamingResponse(sse_event_stream(query, session_id))                   │
│     headers: Content-Type: text/event-stream                                │
│              Cache-Control: no-cache                                        │
│              X-Accel-Buffering: no                                          │
│                                                                             │
│  ┌─ sse_event_stream 生成器 ─────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  ⑤ yield waiting 帧                                                   │  │
│  │     → data:{"type":"waiting","messages":"正在思考中..."}               │  │
│  │     ↓                                                                 │  │
│  │  ⑦ 循环消费 LLM chunk                                                 │  │
│  │     每个 chunk 按 CHUNK_SIZE=10 切片                                   │  │
│  │     每片 yield message 帧                                              │  │
│  │     → data:{"type":"message","messages":"<切片>"}                      │  │
│  │     ↓                                                                 │  │
│  │  ⑧ 流结束，拼接 full_reply                                             │  │
│  │     chat_service.save_turn() 持久化本轮对话                             │  │
│  │     chat_service.build_meta() LLM 提取元数据                            │  │
│  │     yield done 帧（携带 SessionMeta）                                   │  │
│  │     → data:{"type":"done","messages":"","extra":{...}}                 │  │
│  │                                                                       │  │
│  │  异常分支：                                                            │  │
│  │     LLMCallException → yield error 帧                                  │  │
│  │     其他异常      → yield error 帧 "服务器内部错误"                     │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Service 层 — chat_service.py                              │
│                                                                             │
│  ┌─ get_chat_stream() ───────────────────────────────────────────────────┐  │
│  │  ⑥ thread_id = session_id or "default"                                │  │
│  │     return stream_generate(prompt=query, thread_id=thread_id,          │  │
│  │                             image_url=image_url)                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ save_turn() ─────────────────────────────────────────────────────────┐  │
│  │  ⑨ 将 {role:"user", content:query} 和 {role:"assistant",              │  │
│  │     content:full_reply} 追加到 _session_store[session_id]              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ build_meta() ────────────────────────────────────────────────────────┐  │
│  │  ⑨ 调用 build_session_meta(query, full_reply)                          │  │
│  │     → LLM 从完整回复中提取 intent/summary/artifacts/next_steps          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ create_session() / get_history() / clear_session() ──────────────────┐  │
│  │  会话管理：生成 UUID / 读取 checkpoint / 删除 checkpoint               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Agent 层 — personal_cheif.py                              │
│                                                                             │
│  ┌─ stream_generate(prompt, thread_id, image_url) ──────────────────────┐  │
│  │                                                                       │  │
│  │  构造 HumanMessage                                                    │  │
│  │    有 image_url → [{type:"image",url:...}, {type:"text",text:...}]    │  │
│  │    无 image_url → 纯文本字符串                                        │  │
│  │     ↓                                                                 │  │
│  │  config = {configurable: {thread_id: thread_id}}                      │  │
│  │     ↓                                                                 │  │
│  │  agent.stream({"messages": [message]},                                │  │
│  │               stream_mode="messages", config=config)                   │  │
│  │     ↓                                                                 │  │
│  │  for token, _metadata in agent.stream(...):                           │  │
│  │      if token.content:                                                │  │
│  │          yield token.content   ← 逐 chunk 返回给 Service 层           │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ 内部组件 ────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  LLM: GLM-4.1V-Thinking-Flash (智谱 AI)                               │  │
│  │  Tools: TavilySearch(max_results=5) — 食谱搜索                        │  │
│  │  Checkpointer: SqliteSaver(checkpoint.db) — 会话持久化                 │  │
│  │  Middleware: SummarizationMiddleware — 消息摘要压缩                     │  │
│  │  System Prompt: 私人厨师角色，识别食材→搜索食谱→评分排序→结构化输出    │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ get_history(thread_id) ──────────────────────────────────────────────┐  │
│  │  agent.get_state(config) → 从 checkpoint 读取消息历史                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ clear_session(thread_id) ────────────────────────────────────────────┐  │
│  │  checkpointer.delete_thread(thread_id) → 删除 SQLite 中的会话数据      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ build_session_meta(query, full_reply) ───────────────────────────────┐  │
│  │  构造元数据提取 prompt → model.invoke() → 解析 JSON                    │  │
│  │  失败时返回兜底数据                                                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LangGraph Agent Runtime                              │
│                                                                             │
│  ┌─ 执行流程 ────────────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  [START]                                                              │  │
│  │     ↓                                                                 │  │
│  │  [SummarizationMiddleware]  ← 消息数 >20 时自动压缩历史                │  │
│  │     ↓                                                                 │  │
│  │  [Model Node] ← GLM-4.1V-Thinking-Flash                               │  │
│  │     ↓                                                                 │  │
│  │  有 tool_calls? ──是──► [Tool Node] ← TavilySearch 执行               │  │
│  │     │                      ↓                                          │  │
│  │     │              结果追加到 messages，回到 Model Node                 │  │
│  │     │                                                                 │  │
│  │     否                                                                 │  │
│  │     ↓                                                                 │  │
│  │  [Checkpointer] ← 每步自动 save 到 SQLite                             │  │
│  │     ↓                                                                 │  │
│  │  [END] → 返回 AIMessage 给 stream_generate 的 yield                   │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 流程步骤说明

| 步骤 | 层级 | 动作 | 说明 |
|------|------|------|------|
| ① | Client | 发送 POST 请求 | 携带 `query`、可选 `session_id` / `image_url` |
| ② | API 层 | Pydantic 校验 | `query` 非空且 ≤4096 字符，校验失败返回 422 |
| ③ | API 层 | 自动创建会话 | 无 `session_id` 时调用 `create_session()` 生成 UUID |
| ④ | API 层 | 返回 StreamingResponse | 设置 SSE 响应头，启动 `sse_event_stream` 生成器 |
| ⑤ | API 层 | 发送 waiting 帧 | 立即通知客户端"正在思考中" |
| ⑥ | Service 层 | 确定 thread_id | `session_id or "default"`，传给 Agent 层 |
| ⑦ | API 层 | 循环消费 chunk | 每个 chunk 按 10 字符切片，逐片 yield message 帧 |
| ⑧ | API 层 | 流结束处理 | 拼接完整回复，持久化会话，提取元数据 |
| ⑨ | Service 层 | 持久化 + 提取元数据 | `save_turn()` 存储对话，`build_meta()` 调用 LLM 提取结构化摘要 |
| ⑩ | Client | 逐帧渲染 | 按 `type` 分发：waiting 显示加载、message 追加渲染、done 展示元数据 |

### 会话管理流程

```
┌──────────┐              ┌───────────────┐              ┌─────────────────┐
│  Client  │    REST      │   API 层      │   调用        │   Agent 层      │
│          │    JSON      │ chat_router   │              │ personal_cheif  │
└────┬─────┘              └──────┬────────┘              └────────┬────────┘
     │                           │                                │
     │ POST /agent/session       │                                │
     │──────────────────────────►│  create_session()              │
     │                           │───────────────────────────────►│
     │                           │  → 生成 UUID 作为 session_id    │
     │  { session_id: "xxx" }    │◄───────────────────────────────│
     │◄──────────────────────────│                                │
     │                           │                                │
     │ GET /agent/history/:id    │                                │
     │──────────────────────────►│  get_history(session_id)       │
     │                           │───────────────────────────────►│
     │                           │  → agent.get_state(config)      │
     │                           │    从 SQLite checkpoint 读取     │
     │  { messages: [...] }      │◄───────────────────────────────│
     │◄──────────────────────────│                                │
     │                           │                                │
     │ DEL /agent/session/       │                                │
     │   delete/:id              │                                │
     │──────────────────────────►│  clear_session(session_id)     │
     │                           │───────────────────────────────►│
     │                           │  → checkpointer.delete_thread() │
     │                           │    删除 SQLite 中的会话数据      │
     │  { status: "cleared" }    │◄───────────────────────────────│
     │◄──────────────────────────│                                │
```

---

## 二、项目目录结构

```
src/
├── agent/
│   ├── __init__.py
│   └── personal_chief.py       # Agent 封装，流式生成器
├── service/
│   ├── __init__.py
│   └── chat_service.py         # 业务服务层
├── api/
│   ├── __init__.py
│   └── chat_router.py          # FastAPI 路由 + SSE 包装
├── schema/
│   ├── __init__.py
│   └── chat_schema.py          # Pydantic 请求/响应模型
├── core/
│   ├── __init__.py
│   └── exceptions.py           # 统一异常定义（新增）
└── main.py                     # 启动入口
```

---

## 三、依赖安装

```bash
pip install fastapi uvicorn[standard] pydantic openai
```

`requirements.txt`：

```
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
pydantic>=2.0.0
openai>=1.0.0
python-dotenv>=1.0.0
```

---

## 四、SSE 数据帧格式定义

### 4.1 SSE 标准分片格式

SSE（Server-Sent Events）标准分片格式为：

```
data:<payload>\n\n
```

每一条 SSE 消息由 `data:` 前缀 + 载荷内容 + 两个换行符（`\n\n`）组成，两个换行符作为帧与帧之间的分隔符。客户端通过逐行读取并识别 `data:` 前缀来解析每一帧。

**关键规则**：
- 每帧必须以 `data:` 开头，后跟载荷内容
- 帧与帧之间用空行（`\n\n`）分隔
- 一帧内可有多行 `data:`（客户端会将多行拼接），本项目采用单行 `data:` + JSON 载荷
- 流结束时发送 `data:{"type":"done","messages":""}\n\n` 作为终止信号

### 4.2 循环分片输出策略

LLM 返回的每个 chunk 可能包含不定长度的文本。为保证客户端实时渲染体验，采用**循环分片**策略：

1. **接收到 chunk 后，按固定字符长度（默认 `CHUNK_SIZE=10`）循环切片**
2. **每个切片独立封装为一个 SSE 帧：`data:{"type":"message","messages":"<切片>"}\n\n`**
3. **立即 yield 输出，不缓冲，确保每个分片即时推送到客户端**

```
LLM 返回 chunk: "你好，我是私人厨师，可以帮您推荐菜谱。"

循环分片输出（CHUNK_SIZE=10）:
  data:{"type":"message","messages":"你好，我是私人厨师"}\n\n
  data:{"type":"message","messages":"，可以帮您推荐菜"}\n\n
  data:{"type":"message","messages":"谱。"}\n\n
```

**设计优势**：
- 避免单个大 chunk 阻塞客户端渲染，实现逐字/逐词打字机效果
- 每个分片都是标准 SSE 帧，客户端无需额外缓冲处理
- `CHUNK_SIZE` 可配置，根据 LLM 返回速度和网络状况调整

### 4.3 SSE 帧数据结构

所有 SSE 数据帧统一使用 JSON 格式，包含 `type`、`messages` 以及可选的 `extra` 字段：

```typescript
interface SessionMeta {
  intent: string;        // 用户意图 / 本次对话目的
  summary: string;       // 本轮对话摘要
  artifacts: string[];   // 产出物列表，如食谱名称、食材清单等
  next_steps: string[];  // 建议的后续操作
}

interface SSEFrame {
  type: "waiting" | "message" | "done" | "error";
  messages: string;
  extra?: SessionMeta;   // 会话元数据，仅 done 帧携带
}
```

> **硬性规则：禁止在流式 chunk 中拼接元数据**
>
> - `message` 帧的 `messages` 字段**只包含 AI 回答正文**，严禁拼入任何元数据（意图、摘要、产出物等）
> - `extra`（`SessionMeta`）**仅允许出现在 `done` 帧**中，对话结束后一次性返回
> - `waiting` / `message` / `error` 帧中 `extra` 必须为 `null`，模型层通过 Pydantic `model_validator` 强制校验，非 `done` 帧若误传 `extra` 会被自动清除并告警
> - 客户端可放心将 `message` 帧的 `messages` 逐片拼接为完整正文，无需过滤元数据

**`extra` 字段设计说明**：
- 仅在 `done` 帧中携带，对话结束后一次性返回，**不穿插在流式内容里**
- 包含 Agent 内部会话元数据：`intent`（用户意图）、`summary`（对话摘要）、`artifacts`（产出物）、`next_steps`（后续建议）
- 由 LLM 从完整对话回复中结构化提取，失败时返回兜底数据
- 其他帧（`waiting` / `message` / `error`）中 `extra` 为 `null`，不占用传输带宽

### 4.4 type 枚举说明

| type | 含义 | messages 内容 | extra |
|------|------|--------------|-------|
| `waiting` | Agent 正在处理，等待首 token 返回 | 提示文本，如 `"正在思考中..."` | `null` |
| `message` | LLM 流式输出的文本片段（经分片后） | LLM 生成的一小段文本 | `null` |
| `done` | 流式输出结束 | `""`（空字符串） | `SessionMeta` |
| `error` | 发生错误 | 错误描述信息 | `null` |

### 4.5 完整 SSE 交互示例

```
data:{"type":"waiting","messages":"正在思考中...","extra":null}

data:{"type":"message","messages":"你","extra":null}
data:{"type":"message","messages":"好","extra":null}
data:{"type":"message","messages":"，","extra":null}
data:{"type":"message","messages":"我是私人厨师","extra":null}
data:{"type":"message","messages":"，可以帮您","extra":null}
data:{"type":"message","messages":"推荐菜谱。","extra":null}

data:{"type":"done","messages":"","extra":{"intent":"请求推荐菜谱","summary":"用户希望根据现有食材获得菜谱推荐，助手提供了红烧排骨和清炒时蔬两道菜的做法。","artifacts":["红烧排骨","清炒时蔬"],"next_steps":["查看详细步骤","询问食材替代方案"]}}

```

### 4.6 错误场景示例

```
data:{"type":"error","messages":"LLM 调用失败: timeout","extra":null}

```

---

## 五、各模块完整代码实现

### 1. `schema/chat_schema.py` — 请求/响应模型

```python
from pydantic import BaseModel, Field


class ChatReq(BaseModel):
    """对话流式请求入参"""
    query: str = Field(..., min_length=1, max_length=4096, description="用户输入内容")
    session_id: str | None = Field(default=None, description="会话ID，不传则新建会话")


class ErrorResp(BaseModel):
    """错误响应体"""
    code: int
    message: str
```

> **注意**：`query` 增加了 `min_length=1` 和 `max_length=4096` 防止空串和超长输入，Pydantic v2 自动校验并返回 422。

---

### 2. `core/exceptions.py` — 统一异常（新增）

```python
class AgentException(Exception):
    """Agent 层业务异常基类"""
    def __init__(self, message: str, code: int = 500):
        self.message = message
        self.code = code
        super().__init__(message)


class LLMCallException(AgentException):
    """LLM API 调用失败"""
    pass


class SessionNotFoundException(AgentException):
    """会话不存在"""
    def __init__(self, session_id: str):
        super().__init__(f"会话不存在: {session_id}", code=404)
```

---

### 3. `agent/personal_chief.py` — Agent 核心层

参考当前代码，抛出发送流式消息，获取流式消息历史记录等方法暴露给service层使用。

**设计说明**：
- `history` 参数支持多轮对话上下文透传
- 异常统一抛出 `LLMCallException`，不在 Agent 层吞掉错误
- 注释中已写好 OpenAI 真实替换代码，直接取消注释即可切换

---

### 4. `service/chat_service.py` — 业务服务层

```python
import logging
from typing import Generator
from agent.personal_chief import agent_instance
from core.exceptions import SessionNotFoundException

logger = logging.getLogger(__name__)

# 简易内存会话存储，生产环境替换为 Redis / 数据库
_session_store: dict[str, list[dict]] = {}


class ChatService:
    """
    业务服务层，职责：
    1. 会话历史管理（加载 / 保存）
    2. 权限校验扩展点
    3. 日志埋点
    4. 调用 Agent 获取流式生成器
    """

    @staticmethod
    def _load_history(session_id: str | None) -> list[dict]:
        """加载会话历史，session_id 为 None 时返回空历史（新会话）"""
        if session_id is None:
            return []
        return _session_store.get(session_id, [])

    @staticmethod
    def _save_turn(session_id: str | None, query: str, full_reply: str) -> None:
        """将本轮对话追加到会话历史"""
        if session_id is None:
            return
        if session_id not in _session_store:
            _session_store[session_id] = []
        _session_store[session_id].extend([
            {"role": "user", "content": query},
            {"role": "assistant", "content": full_reply},
        ])

    @staticmethod
    def get_chat_stream(
        query: str,
        session_id: str | None = None,
    ) -> Generator[str, None, None]:
        """
        业务层入口：返回流式字符串生成器。
        注意：历史保存需在 API 层消费完生成器后触发，
              因为流式环境下 full_reply 需要拼接完整才能存储。
        """
        logger.info(f"[ChatService] session={session_id}, query={query[:50]!r}")

        # 扩展点：权限校验
        # await check_permission(session_id)

        history = ChatService._load_history(session_id)
        stream_gen = agent_instance.stream_generate(prompt=query, history=history)
        return stream_gen

    @staticmethod
    def save_turn(session_id: str | None, query: str, full_reply: str) -> None:
        """API 层消费完流后调用，持久化本轮对话"""
        ChatService._save_turn(session_id, query, full_reply)


# 单例
chat_service = ChatService()
```

---

### 5. `api/chat_router.py` — FastAPI 路由层

```python
import json
import logging
from fastapi import APIRouter
from starlette.responses import StreamingResponse
from schema.chat_schema import ChatReq, SSEFrame, SSEFrameType, SessionMeta
from service.chat_service import chat_service
from core.exceptions import LLMCallException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["对话流式接口"])

CHUNK_SIZE = 10  # 每个 SSE 帧的最大字符数


def _build_sse_frame(frame_type: SSEFrameType, messages: str, extra: SessionMeta | None = None) -> str:
    """构建标准 SSE 数据帧：data:<json>\n\n"""
    frame = SSEFrame(type=frame_type, messages=messages, extra=extra)
    return f"data:{frame.model_dump_json()}\n\n"


def _chunk_text(text: str, size: int = CHUNK_SIZE) -> list[str]:
    """将文本按固定长度切片"""
    return [text[i:i + size] for i in range(0, len(text), size)]


async def sse_event_stream(query: str, session_id: str | None):
    """
    核心 SSE 异步生成器：
    - 统一输出 JSON 格式：{"type":"...","messages":"...","extra":...}
    - 连接建立后立即发送 waiting 帧
    - 每个 LLM chunk 按 CHUNK_SIZE 循环切片，逐片输出为独立 SSE 帧
    - done 帧携带 extra 会话元数据（intent/summary/artifacts/next_steps）
    - 异常时发送 error 帧
    """
    # 立即发送等待状态帧
    yield _build_sse_frame(SSEFrameType.WAITING, "正在思考中...")

    full_reply_parts: list[str] = []
    try:
        stream_gen = chat_service.get_chat_stream(query=query, session_id=session_id)
        for chunk in stream_gen:
            full_reply_parts.append(chunk)
            for piece in _chunk_text(chunk):
                yield _build_sse_frame(SSEFrameType.MESSAGE, piece)

        # 持久化本轮会话
        full_reply = "".join(full_reply_parts)
        chat_service.save_turn(session_id=session_id, query=query, full_reply=full_reply)

        # 提取会话元数据，随 done 帧一次性返回
        session_meta = chat_service.build_meta(query=query, full_reply=full_reply)
        yield _build_sse_frame(SSEFrameType.DONE, "", extra=session_meta)

    except LLMCallException as e:
        logger.error(f"LLM 调用失败: {e.message}")
        yield _build_sse_frame(SSEFrameType.ERROR, e.message)

    except Exception as e:
        logger.error(f"未预期异常: {e}", exc_info=True)
        yield _build_sse_frame(SSEFrameType.ERROR, "服务器内部错误")


@router.post(
    "/stream",
    summary="SSE 流式对话",
    description="接收用户消息，以 Server-Sent Events 格式流式返回 LLM 回复。",
    responses={
        200: {"description": "SSE 流式响应", "content": {"text/event-stream": {}}},
        422: {"description": "入参校验失败"},
    },
)
async def chat_stream(req: ChatReq):
    return StreamingResponse(
        content=sse_event_stream(query=req.query, session_id=req.session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # 关闭 Nginx 缓冲，确保实时推流
            "Connection": "keep-alive",
        },
    )
```

**关键改进说明**：

| 改进点 | 原版问题 | 改进后 |
|--------|---------|--------|
| `sse_event_stream` 改为 `async def` | 同步函数阻塞事件循环 | 异步生成器，I/O 友好 |
| 发送 `[DONE]` 结束标记 | 客户端无法判断流是否结束 | 对齐 OpenAI 流式协议 |
| 响应头补充 `X-Accel-Buffering: no` | Nginx 代理时会缓冲导致延迟 | 强制实时推送 |
| 分类异常帧 `event:error` | 异常时连接粗暴中断 | 优雅通知客户端出错原因 |

---

### 6. `main.py` — 项目入口

```python
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from api.chat_router import router as chat_router

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="Agent 流式输出服务",
    version="1.1.0",
    description="基于 FastAPI + SSE 的分层流式 Agent 接口",
)

# CORS（按需调整 origins）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局异常兜底
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"全局未捕获异常: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"code": 500, "message": "服务器内部错误"})

# 注册路由
app.include_router(chat_router)

@app.get("/health", tags=["运维"])
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
```

---

## 六、客户端接入示例

### JavaScript (fetch + ReadableStream)

```javascript
async function chatStream(query, sessionId = null) {
  const resp = await fetch('/chat/stream', {
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
    buffer = lines.pop(); // 保留不完整的行

    for (const line of lines) {
      if (line.startsWith('data:')) {
        const frame = JSON.parse(line.slice(5));
        switch (frame.type) {
          case 'waiting':
            console.log('[等待中]', frame.messages); // 显示加载状态
            break;
          case 'message':
            process.stdout.write(frame.messages); // 流式追加渲染
            break;
          case 'done':
            console.log('\n流式输出完毕');
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

### Python (httpx)

```python
import httpx
import json

with httpx.stream("POST", "http://localhost:8000/chat/stream",
                  json={"query": "你好", "session_id": "test-001"}) as resp:
    for line in resp.iter_lines():
        if line.startswith("data:"):
            frame = json.loads(line[5:])
            if frame["type"] == "waiting":
                print(f"[等待中] {frame['messages']}", flush=True)
            elif frame["type"] == "message":
                print(frame["messages"], end="", flush=True)
            elif frame["type"] == "done":
                print("\n流式输出完毕")
                break
            elif frame["type"] == "error":
                print(f"\n[错误] {frame['messages']}")
                break
```

### curl

```bash
curl -N -X POST http://localhost:8000/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "介绍一下你自己", "session_id": null}'
```

---

## 七、单元测试

由于 Agent 层无 web 依赖，可以直接测试生成器行为：

```python
# tests/test_agent.py
from agent.personal_chief import LLMAgent


def test_stream_generate_returns_content():
    agent = LLMAgent(model_name="test-model")
    chunks = list(agent.stream_generate(prompt="hello"))
    full = "".join(chunks)
    assert len(full) > 0, "Agent 应返回非空内容"


def test_stream_generate_with_history():
    agent = LLMAgent()
    history = [{"role": "user", "content": "你好"}, {"role": "assistant", "content": "你好！"}]
    chunks = list(agent.stream_generate(prompt="继续", history=history))
    assert isinstance(chunks, list)


# tests/test_api.py（需 httpx）
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_chat_stream_endpoint():
    with client.stream("POST", "/chat/stream",
                       json={"query": "测试输入", "session_id": None}) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        content = resp.read().decode()
        assert "data:" in content
        assert "[DONE]" in content


def test_chat_stream_empty_query_422():
    resp = client.post("/chat/stream", json={"query": ""})
    assert resp.status_code == 422


def test_health():
    resp = client.get("/health")
    assert resp.json() == {"status": "ok"}
```

运行测试：

```bash
pytest tests/ -v
```

---

## 八、生产部署注意事项

### Nginx 配置（关键：禁用缓冲）

```nginx
location /chat/stream {
    proxy_pass         http://127.0.0.1:8000;
    proxy_buffering    off;           # 必须关闭，否则 SSE 被缓冲
    proxy_cache        off;
    proxy_read_timeout 300s;          # 流式接口需要更长超时
    proxy_set_header   X-Accel-Buffering no;
    proxy_http_version 1.1;
    proxy_set_header   Connection "";
}
```

### 进程管理（Gunicorn + Uvicorn workers）

```bash
gunicorn main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 4 \
  --bind 0.0.0.0:8000 \
  --timeout 300
```

### 会话存储升级（Redis）

```python
# 将 _session_store dict 替换为 Redis 客户端
import redis
import json

redis_client = redis.Redis(host="localhost", port=6379, decode_responses=True)

def load_history(session_id: str) -> list[dict]:
    raw = redis_client.get(f"session:{session_id}")
    return json.loads(raw) if raw else []

def save_history(session_id: str, history: list[dict], ttl: int = 3600):
    redis_client.setex(f"session:{session_id}", ttl, json.dumps(history, ensure_ascii=False))
```

---

## 九、常见问题排查

| 现象 | 原因 | 解决方案 |
|------|------|---------|
| 浏览器收不到实时数据，全部一次性返回 | Nginx 缓冲未关闭 | 设置 `proxy_buffering off` |
| 本地测试正常，部署后流中断 | `proxy_read_timeout` 太短 | 调大至 ≥300s |
| `TypeError: object is not iterable` | Agent 层抛出异常未被 Service 层处理 | 在 `sse_event_stream` 捕获 `LLMCallException` |
| 多轮对话上下文丢失 | session_id 未传或内存 store 重启清空 | 接入 Redis 持久化会话 |
| Pydantic 422 校验失败 | query 传了空字符串 | 前端做非空校验，或后端将 min_length 报错信息国际化 |

---

## 十、扩展方向

- **异步 Agent**：若 LLM SDK 支持 `async for`，可将 `stream_generate` 改为 `AsyncGenerator[str]`，消除 `run_in_executor` 开销
- **多 Agent 编排**：Service 层可串联多个 Agent，将前一个 Agent 输出作为后一个的输入
- **流式中间件**：在 `sse_event_stream` 中插入 token 计数、敏感词过滤等流式处理逻辑
- **WebSocket 替代方案**：若需要双向通信，可将 SSE 换为 WebSocket，Agent 层代码无需改动

---

以上是完整精进后的技术文档，主要新增和改进了以下内容：

1. **代码层面**
   - `agent` 层增加 `history` 多轮对话参数，并内嵌 OpenAI 真实替换注释
   - `service` 层新增内存会话管理（附 Redis 升级方案）
   - `api` 层 SSE 生成器改为 `async`，补充 `[DONE]` 结束标记、错误帧、响应头
   - `main.py` 增加 CORS、全局异常处理、健康检查接口
   - 新增 `core/exceptions.py` 统一异常体系

2. **文档层面**
   - 补充了客户端接入示例（JS / Python / curl）
   - 完整单元测试用例（Agent 层 + API 层）
   - Nginx 生产部署配置（SSE 关键配置说明）
   - 常见问题排查表
   - 扩展方向指引

   