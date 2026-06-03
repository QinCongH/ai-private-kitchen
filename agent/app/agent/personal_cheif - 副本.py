"""
私人厨师智能体模块

基于 LangChain + LangGraph 构建的 AI 智能体，能够根据用户提供的食材照片或清单，
通过联网搜索推荐合适的菜谱，并从营养价值和制作难度两个维度进行评估排序。

核心能力：
- 多模态输入：支持纯文本和图文混合（食材照片+文字描述）
- 联网搜索：通过 Tavily 搜索引擎实时检索菜谱
- 消息持久化：基于 SQLite 的 checkpoint 机制，会话状态跨重启保留
- 消息摘要：当对话轮次过多时自动总结历史，控制上下文长度
- 流式输出：逐 token 返回响应，提升用户交互体验
"""

import asyncio
import os
import sqlite3
from collections.abc import AsyncGenerator
from pathlib import Path

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langchain.chat_models import init_chat_model
from langchain.messages import AIMessage, HumanMessage
from langchain_tavily import TavilySearch
from langgraph.checkpoint.sqlite import SqliteSaver

# 加载 .env 文件中的环境变量（ZHIPU_BASE_URL、ZHIPU_API_KEY、TAVILY_API_KEY）
load_dotenv()

# 全局 SQLite 连接池和 checkpointer（保证生命周期贯穿应用全程）
_db_path = Path(__file__).parent / "checkpoint.db"
_db_connection = sqlite3.connect(
    str(_db_path),
    check_same_thread=False,
    timeout=10,
)
_checkpointer = SqliteSaver(_db_connection)
_checkpointer.setup()

# 智能体系统提示词：定义角色、工作流程和输出规范
system_prompt = """你是一名私人厨师。收到用户提供的食材照片或清单后，请按以下流程操作：
1.识别和评估食材：若用户提供照片，首先辨识所有可见食材。基于食材的外观状态，评估其新鲜度与可用量，整理出一份[当前可用食材清单]。
2.智能食谱检索：优先调用 web_search 工具，以[可用食材清单]为核心关键词，查找可行菜谱。
3.多维度评估与排序：从营养价值和制作难度两个维度对检索到的候选食谱进行量化打分，并根据得分排序，制作简单且营养丰富的排名靠前。
4.结构化方案输出：把排序后的食谱整理为一份结构清晰的建议报告，要包含食谱信息、得分、推荐理由、食谱的参考图片，帮助用户快速做出决策。

请严格按照流程，优先调用 web_search 工具搜索食谱，搜索不到的情况下才能自己发挥。
"""


def _create_agent():
    """
    创建并配置私人厨师智能体实例。

    组件说明：
    - model: 智谱 GLM-4.1V-Thinking-Flash 模型，支持多模态（图片+文本）输入
    - middleware: 消息摘要中间件，当消息数超过 3 条时自动总结，仅保留最近 1 条原始消息
    - checkpointer: 基于 SQLite 的持久化检查点，用于保存和恢复会话状态
    - tools: Tavily 搜索工具，用于联网检索菜谱信息

    Returns:
        配置完成的 LangChain agent 实例
    """
    # 初始化大语言模型（通过 OpenAI 兼容接口调用智谱 API）
    model = init_chat_model(
        model="GLM-4.1V-Thinking-Flash",
        model_provider="openai",
        base_url=os.getenv("ZHIPU_BASE_URL"),
        api_key=os.getenv("ZHIPU_API_KEY"),
    )

    # 初始化消息摘要中间件：
    # - trigger=("messages", 3): 当会话消息数超过 3 条时触发摘要
    # - keep=("messages", 1): 摘要后仅保留最近 1 条原始消息
    middleware = SummarizationMiddleware(
        model=model,
        trigger=("messages", 3),
        keep=("messages", 1),
    )

    # 初始化 SQLite 持久化检查点（会话状态存储在 checkpoint.db 文件中）
    # 使用全局 checkpointer 确保所有操作共用同一实例
    checkpointer = _checkpointer

    # 初始化 Tavily 搜索工具：每次搜索最多返回 5 条通用主题结果
    tavily_tool = TavilySearch(max_results=5, topic="general")

    # 创建智能体：绑定模型、系统提示词、持久化存储、工具和中间件
    return create_agent(
        model=model,
        system_prompt=system_prompt,
        checkpointer=checkpointer,
        tools=[tavily_tool],
        middleware=[middleware],
    )


# 模块级智能体单例（应用生命周期内复用）
agent = _create_agent()


async def stream_chat(prompt: str, thread_id: str, image: str | None = None) -> AsyncGenerator[str, None]:
    """
    与智能体进行流式对话。

    支持纯文本和图文混合两种输入模式。通过 thread_id 隔离不同会话，
    同一 thread_id 的消息会自动关联历史上下文。

    Args:
        prompt: 用户发送的文本消息
        thread_id: 会话线程 ID，用于标识和隔离不同对话
        image: 可选的图片 URL，支持食材照片等多模态输入

    Yields:
        str: 智能体响应的文本片段（逐 token 流式返回）
    """
    content: list[dict] = []
    if image:
        content.append({"type": "image", "url": image})
    content.append({"type": "text", "text": prompt})

    message = HumanMessage(content=content)
    print(f"[stream_chat] 会话={thread_id} | 收到消息: prompt={prompt[:50]}..., image={'有' if image else '无'}")

    config = {"configurable": {"thread_id": thread_id}}
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    def _run_stream():
        token_count = 0
        try:
            for chunk in agent.stream(
                {"messages": [message]},
                stream_mode="messages",
                config=config,
            ):
                # chunk 是 (namespace, message) 元组
                if isinstance(chunk, tuple) and len(chunk) == 2:
                    _, msg = chunk
                else:
                    msg = chunk
                if isinstance(msg, AIMessage) and msg.content:
                    token_count += 1
                    asyncio.run_coroutine_threadsafe(queue.put(msg.content), loop)

            print(f"[stream_chat] 会话={thread_id} | 流式结束, 共 {token_count} 个片段")
        except Exception as e:
            print(f"[stream_chat] 异常 thread_id={thread_id}: {e}")
            import traceback
            traceback.print_exc()
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, _run_stream)

    # 立即开始流式返回数据，不阻塞
    while True:
        chunk = await queue.get()
        if chunk is None:
            break
        yield chunk


def clear_session(thread_id: str) -> None:
    """
    清空指定会话的所有历史消息和状态。

    通过 LangGraph checkpointer 删除该 thread_id 对应的全部 checkpoint 数据，
    包括消息历史、摘要状态等。

    Args:
        thread_id: 要清空的会话线程 ID
    """
    print(f"[clear_session] 清空会话: thread_id={thread_id}")
    config = {"configurable": {"thread_id": thread_id}}
    _checkpointer.delete(config)
    print(f"[clear_session] 会话已清空: thread_id={thread_id}")


def get_history(thread_id: str) -> list[dict]:
    """
    获取指定会话的历史消息记录。

    从 LangGraph checkpointer 中读取会话状态，提取所有消息并转换为
    统一的字典格式返回。支持处理纯文本消息和多模态消息（提取文本部分）。

    Args:
        thread_id: 要查询的会话线程 ID

    Returns:
        list[dict]: 消息列表，每条消息包含 role("user"/"assistant") 和 content 字段。
                     如果会话不存在或无消息，返回空列表。
    """
    config = {"configurable": {"thread_id": thread_id}}

    state = _checkpointer.get(config)
    print(f"[get_history] 查询 thread_id={thread_id}, state 类型={type(state)}")

    if not state:
        print(f"[get_history] state 为空")
        return []

    # LangGraph checkpoint 返回的是完整图状态，消息在 channel_values 中
    channel_values = state.get("channel_values", {})
    messages_raw = channel_values.get("messages", [])

    if not messages_raw:
        print(f"[get_history] 未找到消息: thread_id={thread_id}")
        return []

    print(f"[get_history] 找到 {len(messages_raw)} 条原始消息")

    messages = []
    for msg in messages_raw:
        role = "user" if isinstance(msg, HumanMessage) else "assistant"

        if isinstance(msg.content, str):
            messages.append({"role": role, "content": msg.content})
        elif isinstance(msg.content, list):
            text = "".join(
                part.get("text", "")
                for part in msg.content
                if isinstance(part, dict) and part.get("type") == "text"
            )
            messages.append({"role": role, "content": text})

    print(f"[get_history] 返回 {len(messages)} 条消息: thread_id={thread_id}")
    return messages
