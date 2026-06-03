import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.schemas.chat import (
    ChatReq,
    CreateSessionResponse,
    HistoryResponse,
    SessionMeta,
    SSEFrame,
    SSEFrameType,
)
from app.services.chat import chat_service
from app.core.exceptions import LLMCallException

logger = logging.getLogger(__name__)

router = APIRouter(tags=["对话流式接口"])


@router.post("/session", response_model=CreateSessionResponse)
async def create_session():
    session_id = chat_service.create_session()
    return CreateSessionResponse(session_id=session_id)


CHUNK_SIZE = 10  # 每个 SSE 帧的最大字符数，可按需调整


def _build_sse_frame(frame_type: SSEFrameType, messages: str, extra: SessionMeta | None = None) -> str:
    """构建标准 SSE 数据帧：data:<json>\n\n"""
    frame = SSEFrame(type=frame_type, messages=messages, extra=extra)
    return f"data:{frame.model_dump_json()}\n\n"


def _chunk_text(text: str, size: int = CHUNK_SIZE) -> list[str]:
    """将文本按固定长度切片"""
    return [text[i:i + size] for i in range(0, len(text), size)]


async def sse_event_stream(query: str, session_id: str | None, image_url: str | None = None):
    """
    核心 SSE 异步生成器：
    - 统一输出 JSON 格式：{"type": "...", "messages": "..."}
    - 连接建立后立即发送 waiting 帧，告知客户端正在等待 Agent 响应
    - 每个 LLM chunk 按 CHUNK_SIZE 循环切片，逐片输出为独立 SSE 帧
    - 异常时发送 error 帧，优雅通知客户端
    """
    # 立即发送等待状态帧
    yield _build_sse_frame(SSEFrameType.WAITING, "正在思考中...")

    full_reply_parts: list[str] = []
    try:
        stream_gen = chat_service.get_chat_stream(
            query=query, session_id=session_id, image_url=image_url
        )
        for chunk in stream_gen:
            full_reply_parts.append(chunk)
            # 循环分片：将 chunk 按 CHUNK_SIZE 切片，每片独立输出为一个 SSE 帧
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
    "/chat/{session_id}",
    summary="SSE 流式对话（指定会话）",
    description="接收用户消息，以 Server-Sent Events 格式流式返回 LLM 回复。",
    responses={
        200: {"description": "SSE 流式响应", "content": {"text/event-stream": {}}},
        422: {"description": "入参校验失败"},
    },
)
async def chat(session_id: str, body: ChatReq):
    return StreamingResponse(
        content=sse_event_stream(query=body.query, session_id=session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post(
    "/chat",
    summary="SSE 流式对话（自动创建会话）",
    description="不传 session_id 时自动创建新会话，以 SSE 格式流式返回 LLM 回复。",
    responses={
        200: {"description": "SSE 流式响应", "content": {"text/event-stream": {}}},
        422: {"description": "入参校验失败"},
    },
)
async def chat_new(body: ChatReq):
    session_id = body.session_id or chat_service.create_session()
    return StreamingResponse(
        content=sse_event_stream(query=body.query, session_id=session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/history/{session_id}", response_model=HistoryResponse)
async def get_history(session_id: str):
    messages = chat_service.get_history(session_id)
    return HistoryResponse(messages=messages)


@router.delete("/session/{session_id}")
async def clear_session(session_id: str):
    chat_service.clear_session(session_id)
    return {"status": "cleared"}
