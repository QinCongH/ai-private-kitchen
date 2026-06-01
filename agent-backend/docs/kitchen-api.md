# 味知AI 厨房智能体 — 技术开发文档

## 1. 概述

味知AI 是一个基于 LangGraph 的多模态烹饪助手，支持食材图片识别、智能食谱搜索与排序、创意搭配建议等功能。本文档描述其后端 API 的实现细节与接入方式。

## 2. 技术栈

| 组件 | 技术 | 版本 |
|---|---|---|
| Web 框架 | FastAPI | >=0.136.1 |
| ASGI 服务器 | Uvicorn | >=0.46.0 |
| LLM 编排 | LangChain + LangGraph | >=1.3.0 / >=1.2.0 |
| LLM 模型 | 智谱 GLM-4V-Flash (OpenAI 兼容) | — |
| 会话持久化 | SQLite (langgraph-checkpoint-sqlite) | >=3.1.0 |
| 搜索工具 | Tavily Search | >=0.7.24 |
| 数据校验 | Pydantic + pydantic-settings | >=2.14.1 |

## 3. 项目结构

```
agent-backend/
├── backend/
│   ├── main.py                  # FastAPI 应用入口
│   ├── core/
│   │   └── config.py            # 应用配置（pydantic-settings）
│   ├── models/
│   │   ├── base.py              # BaseResponse / HealthCheck
│   │   └── kitchen.py           # ChatRequest 请求模型
│   ├── services/
│   │   └── kitchen_service.py   # 厨房智能体服务（核心逻辑）
│   ├── api/
│   │   ├── router.py            # 通用路由（/health, /info）
│   │   └── v1/
│   │       ├── __init__.py      # v1 模块入口
│   │       └── kitchen.py       # 厨房 API 路由
│   └── agents/
│       └── checkpoint.db        # SQLite 会话持久化数据库
├── .env                         # 环境变量（API Keys 等）
└── pyproject.toml
```

## 4. 环境变量

| 变量名 | 必填 | 说明 |
|---|---|---|
| `ZHIPU_BASE_URL` | 是 | 智谱 AI OpenAI 兼容接口地址 |
| `ZHIPU_API_KEY` | 是 | 智谱 AI API 密钥 |
| `TAVILY_API_KEY` | 是 | Tavily 搜索 API 密钥 |

## 5. API 接口

所有接口前缀为 `/api/v1/kitchen`。

### 5.1 流式聊天接口

**POST** `/api/v1/kitchen/chat`

以 SSE（Server-Sent Events）方式流式返回 AI 回复，支持多模态输入（文本 + 图片）。

**请求体（JSON）：**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `message` | string | 是 | — | 用户消息内容 |
| `thread_id` | string | 否 | `"default"` | 会话 ID，相同 thread_id 共享对话记忆 |
| `image_url` | string | 否 | `null` | 图片 URL，传入后触发多模态识别 |

**请求示例：**

```json
{
  "message": "冰箱里有西红柿和鸡蛋，能做什么？",
  "thread_id": "user_001",
  "image_url": null
}
```

**多模态请求示例：**

```json
{
  "message": "帮我看看这些食材可以做什么",
  "thread_id": "user_001",
  "image_url": "https://example.com/ingredients.jpg"
}
```

**响应格式（SSE）：**

流式返回，每条事件格式为：

```
data: {"content": "部分回复文本"}
```

流结束时发送：

```
data: [DONE]
```

**前端接入示例（JavaScript）：**

```javascript
const eventSource = new EventSource('/api/v1/kitchen/chat', {
  // 注意：EventSource 仅支持 GET，POST 请求需使用 fetch + ReadableStream
});

// 推荐：使用 fetch 处理 POST SSE
async function streamChat(message, threadId, imageUrl = null) {
  const response = await fetch('/api/v1/kitchen/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, thread_id: threadId, image_url: imageUrl }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        const parsed = JSON.parse(data);
        process.stdout.write(parsed.content);
      }
    }
  }
}
```

**cURL 测试：**

```bash
curl -X POST http://localhost:8000/api/v1/kitchen/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "西红柿炒鸡蛋怎么做？", "thread_id": "test_001"}' \
  --no-buffer
```

---

### 5.2 获取历史消息

**GET** `/api/v1/kitchen/history/{thread_id}`

获取指定会话的完整历史消息列表。

**路径参数：**

| 参数 | 类型 | 说明 |
|---|---|---|
| `thread_id` | string | 会话 ID |

**响应体：**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "thread_id": "user_001",
    "messages": [
      { "role": "human", "content": "西红柿炒鸡蛋怎么做？" },
      { "role": "ai", "content": "好的，西红柿炒鸡蛋是一道经典家常菜..." }
    ]
  }
}
```

**cURL 测试：**

```bash
curl http://localhost:8000/api/v1/kitchen/history/user_001
```

---

### 5.3 清空历史消息

**DELETE** `/api/v1/kitchen/history/{thread_id}`

删除指定会话的所有检查点数据，清空对话记忆。

**路径参数：**

| 参数 | 类型 | 说明 |
|---|---|---|
| `thread_id` | string | 会话 ID |

**成功响应：**

```json
{
  "code": 200,
  "message": "历史消息已清空",
  "data": {
    "thread_id": "user_001"
  }
}
```

**失败响应：**

```json
{
  "code": 500,
  "message": "清空历史消息失败",
  "data": null
}
```

**cURL 测试：**

```bash
curl -X DELETE http://localhost:8000/api/v1/kitchen/history/user_001
```

## 6. 核心模块说明

### 6.1 KitchenService（服务层）

位置：`backend/services/kitchen_service.py`

单例模式，懒加载初始化智能体。首次调用时自动完成以下初始化：

1. 加载 GLM-4V-Flash 多模态模型
2. 连接 SQLite 检查点数据库（`agents/checkpoint.db`）
3. 初始化 Tavily 搜索工具
4. 编译 LangGraph ReAct 智能体

**核心方法：**

| 方法 | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `stream_chat` | `message`, `thread_id`, `image_url` | Generator[str] | 流式输出 SSE 格式的 AI 回复 |
| `get_history` | `thread_id` | `list[dict]` | 从检查点状态中提取历史消息 |
| `clear_history` | `thread_id` | `bool` | 删除指定 thread_id 的所有检查点记录 |

### 6.2 数据模型

**ChatRequest**（`backend/models/kitchen.py`）：

```python
class ChatRequest(BaseModel):
    message: str          # 用户消息，至少 1 字符
    thread_id: str        # 会话 ID，默认 "default"
    image_url: str | None # 可选图片 URL
```

**BaseResponse**（`backend/models/base.py`）：

```python
class BaseResponse(BaseModel):
    code: int = 200
    message: str = "success"
    data: dict | None = None
```

### 6.3 会话持久化机制

- 使用 LangGraph 的 SQLite Checkpointer 存储对话状态
- 每个会话通过 `thread_id` 隔离，不同 `thread_id` 的对话记忆互不干扰
- 数据库文件位于 `backend/agents/checkpoint.db`
- 检查点存储涉及三张表：`checkpoints`、`checkpoint_blobs`、`checkpoint_writes`
- 清空历史时删除指定 `thread_id` 在三张表中的全部记录

### 6.4 智能体工作流

```
用户输入 → HumanMessage 构建 → LangGraph ReAct Agent
                                    ├── LLM 推理（GLM-4V-Flash）
                                    ├── 工具调用（Tavily Search）
                                    └── 检查点读写（SQLite）
                                → 流式输出 SSE
```

智能体具备以下能力：

| 能力 | 说明 |
|---|---|
| 图片识别 | 识别用户上传的食材图片，列出食材清单 |
| 智能搜索 | 基于食材搜索匹配食谱（通过 Tavily） |
| 智能排序 | 按推荐度/难度/营养综合排序 |
| 创意建议 | 食材不足时提供创意搭配 |
| 多轮对话 | 基于 thread_id 保持上下文记忆 |

## 7. 启动与部署

```bash
# 安装依赖
cd agent-backend
uv sync

# 启动服务
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# 访问 API 文档
# Swagger UI: http://localhost:8000/docs
# ReDoc:      http://localhost:8000/redoc
```

## 8. 接口汇总

| 方法 | 路径 | 说明 | Content-Type |
|---|---|---|---|
| POST | `/api/v1/kitchen/chat` | 流式聊天（SSE） | `text/event-stream` |
| GET | `/api/v1/kitchen/history/{thread_id}` | 获取历史消息 | `application/json` |
| DELETE | `/api/v1/kitchen/history/{thread_id}` | 清空历史消息 | `application/json` |
