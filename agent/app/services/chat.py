import logging
from collections.abc import Generator

from app.agent.personal_cheif import stream_generate, get_history, clear_session, build_session_meta
from app.schemas.chat import ChatResponse, SessionMeta

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
        image_url: str | None = None,
    ) -> Generator[str, None, None]:
        """
        业务层入口：返回流式字符串生成器。
        历史保存需在 API 层消费完生成器后触发，
        因为流式环境下 full_reply 需要拼接完整才能存储。
        """
        logger.info(f"[ChatService] session={session_id}, query={query[:50]!r}")

        # 扩展点：权限校验
        # await check_permission(session_id)

        thread_id = session_id or "default"
        stream_gen = stream_generate(prompt=query, thread_id=thread_id, image_url=image_url)
        return stream_gen

    @staticmethod
    def save_turn(session_id: str | None, query: str, full_reply: str) -> None:
        """API 层消费完流后调用，持久化本轮对话"""
        ChatService._save_turn(session_id, query, full_reply)

    @staticmethod
    def get_history(session_id: str) -> list[ChatResponse]:
        """获取指定会话的历史消息"""
        raw = get_history(thread_id=session_id)
        return [ChatResponse(**msg) for msg in raw]

    @staticmethod
    def clear_session(session_id: str) -> None:
        """清除指定会话"""
        clear_session(thread_id=session_id)

    @staticmethod
    def build_meta(query: str, full_reply: str) -> SessionMeta:
        """构建本轮对话的会话元数据"""
        return build_session_meta(query=query, full_reply=full_reply)


chat_service = ChatService()
