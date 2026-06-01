import json

from backend.agents.kitchen import kitchen_agent


class KitchenService:
    """厨房智能体服务 — 负责业务编排与协议适配"""

    def stream_chat(self, message: str, thread_id: str, image_url: str | None = None):
        """流式聊天，yield SSE 格式数据"""
        for content in kitchen_agent.stream(message, thread_id, image_url):
            yield f"data: {json.dumps({'content': content}, ensure_ascii=False)}\n\n"

        yield "data: [DONE]\n\n"

    def get_history(self, thread_id: str) -> list[dict]:
        """获取历史消息"""
        return kitchen_agent.get_history(thread_id)

    def clear_history(self, thread_id: str) -> bool:
        """清空历史消息"""
        return kitchen_agent.clear_history(thread_id)


kitchen_service = KitchenService()
