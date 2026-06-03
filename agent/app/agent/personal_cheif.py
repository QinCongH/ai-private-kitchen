import os
import logging
from collections.abc import Generator
from typing import Any

from dotenv import load_dotenv

load_dotenv()

from langchain.chat_models import init_chat_model
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_tavily import TavilySearch
from langchain.messages import HumanMessage
from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware

from app.core.exceptions import LLMCallException
from app.schemas.chat import SessionMeta

logger = logging.getLogger(__name__)

# ── 模型初始化 ──────────────────────────────────────────────
model = init_chat_model(
    model="GLM-4.1V-Thinking-Flash",
    model_provider="openai",
    base_url=os.getenv("ZHIPU_BASE_URL"),
    api_key=os.getenv("ZHIPU_API_KEY"),
)

# ── 记忆中间件 ──────────────────────────────────────────────
middleware = SummarizationMiddleware(
    model=model,
    trigger=("messages", 3),
    keep=("messages", 1),
)

# ── 系统提示词 ──────────────────────────────────────────────
SYSTEM_PROMPT = """\
你是一名私人厨师。收到用户提供的食材照片或清单后，请按以下流程操作：
1.识别和评估食材：若用户提供照片，首先辨识所有可见食材。基于食材的外观状态，评估其新鲜度与可用量，整理出一份"当前可用食材清单"。
2.智能食谱检索：优先调用 web_search 工具，以"可用食材清单"为核心关键词，查找可行菜谱。
3.多维度评估与排序：从营养价值和制作难度两个维度对检索到的候选食谱进行量化打分，并根据得分排序，制作简单且营养丰富的排名靠前。
4.结构化方案输出：把排序后的食谱整理为一份结构清晰的建议报告，要包含食谱信息、得分、推荐理由、食谱的参考图片，帮助用户快速做出决策。

请严格按照流程，优先调用 web_search 工具搜索食谱，搜索不到的情况下才能自己发挥。
"""

# ── 工具初始化 ──────────────────────────────────────────────
tavily_tool = TavilySearch(max_results=5, topic="general")

# ── 持久化 Checkpointer ────────────────────────────────────
import sqlite3

checkpointer = SqliteSaver(sqlite3.connect("checkpoint.db", check_same_thread=False))
checkpointer.setup()

# ── Agent 实例 ──────────────────────────────────────────────
agent = create_agent(
    model=model,
    system_prompt=SYSTEM_PROMPT,
    checkpointer=checkpointer,
    tools=[tavily_tool],
    middleware=[middleware],
)
# ── 对外暴露的流式接口 ──────────────────────────────────────


def stream_generate(
    prompt: str,
    thread_id: str,
    image_url: str | None = None,
) -> Generator[str, None, None]:
    """
    同步流式生成器，逐 chunk 输出 LLM 回复文本。
    Agent 层不感知 HTTP，只暴露 Generator[str]。
    """
    # 构造消息体
    if image_url:
        content: list[dict[str, Any]] = [
            {"type": "image", "url": image_url},
            {"type": "text", "text": prompt},
        ]
    else:
        content = prompt

    message = HumanMessage(content=content)
    config = {"configurable": {"thread_id": thread_id}}

    try:
        for token, _metadata in agent.stream(
            {"messages": [message]},
            stream_mode="messages",
            config=config,
        ):
            if token.content:
                print('start++++++++++++++++++++++++++++++++++++++\n')
                print(_metadata)
                print('end++++++++++++++++++++++++++++++++++++++\n')
                # print(token.content, end="", flush=True)
                yield token.content
    except Exception as e:
        logger.error(f"Agent 流式生成失败: {e}", exc_info=True)
        raise LLMCallException(f"LLM 调用失败: {e}") from e


def get_history(thread_id: str) -> list[dict[str, str]]:
    """获取指定会话的消息历史"""
    config = {"configurable": {"thread_id": thread_id}}
    try:
        state = agent.get_state(config)
        messages = state.values.get("messages", [])
        result = []
        for msg in messages:
            role = "user" if msg.type == "human" else "assistant"
            result.append({"role": role, "content": msg.content})
        return result
    except Exception as e:
        logger.error(f"获取历史失败: {e}", exc_info=True)
        return []


def clear_session(thread_id: str) -> None:
    """清除指定会话的状态（通过 checkpoint）"""
    config = {"configurable": {"thread_id": thread_id}}
    try:
        agent.update_state(config, {"messages": []})
    except Exception as e:
        logger.error(f"清除会话失败: {e}", exc_info=True)


# ── 会话元数据提取 ──────────────────────────────────────────

# 元数据提取提示词，用于从完整对话中生成结构化摘要
_META_PROMPT = """\
请根据以下对话内容，输出一份 JSON 格式的会话元数据，字段如下：
- intent: 用户的核心意图，一句话概括
- summary: 本轮对话摘要，2-3 句话
- artifacts: 本次对话产出的具体内容（如食谱名称、食材清单等），以字符串数组返回
- next_steps: 建议用户后续可执行的操作，以字符串数组返回

只输出 JSON，不要输出其他内容。

对话内容：
{conversation}
"""


def build_session_meta(query: str, full_reply: str) -> SessionMeta:
    """
    从本轮对话中提取会话元数据（intent / summary / artifacts / next_steps）。
    使用 LLM 从完整对话回复中结构化提取，失败时返回兜底元数据。
    """
    try:
        import json

        conversation = f"用户: {query}\n助手: {full_reply}"
        meta_message = HumanMessage(content=_META_PROMPT.format(conversation=conversation))
        # 使用模型直接调用（非 agent 模式），避免污染主对话状态
        response = model.invoke([meta_message])
        # 尝试从响应中解析 JSON
        content = response.content.strip()
        # 兼容 markdown 代码块包裹的情况
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        data = json.loads(content)
        return SessionMeta(
            intent=data.get("intent", ""),
            summary=data.get("summary", ""),
            artifacts=data.get("artifacts", []),
            next_steps=data.get("next_steps", []),
        )
    except Exception as e:
        logger.warning(f"会话元数据提取失败，返回兜底数据: {e}")
        return SessionMeta(
            intent=query[:100],
            summary=full_reply[:200] if full_reply else "",
            artifacts=[],
            next_steps=[],
        )
