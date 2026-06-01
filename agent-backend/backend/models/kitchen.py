from pydantic import BaseModel, Field
from typing import Optional


class ChatRequest(BaseModel):
    """聊天请求"""

    message: str = Field(..., min_length=1, description="用户消息")
    thread_id: str = Field(default="default", description="会话ID")
    image_url: Optional[str] = Field(default=None, description="图片URL（可选，用于多模态输入）")
