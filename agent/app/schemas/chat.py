from enum import Enum
import logging

from pydantic import BaseModel, Field, model_validator

logger = logging.getLogger(__name__)


class SSEFrameType(str, Enum):
    """SSE 帧类型枚举"""
    WAITING = "waiting"
    MESSAGE = "message"
    DONE = "done"
    ERROR = "error"


class SessionMeta(BaseModel):
    """Agent 内部会话元数据，仅在 done 帧中一次性返回"""
    intent: str = Field(default="", description="用户意图 / 本次对话目的")
    summary: str = Field(default="", description="本轮对话摘要")
    artifacts: list[str] = Field(default_factory=list, description="产出物列表，如食谱名称、步骤清单等")
    next_steps: list[str] = Field(default_factory=list, description="建议的后续操作")


class ChatReq(BaseModel):
    """对话流式请求入参"""
    query: str = Field(..., min_length=1, max_length=4096, description="用户输入内容")
    session_id: str | None = Field(default=None, description="会话ID，不传则新建会话")


class SSEFrame(BaseModel):
    """SSE 数据帧统一格式

    硬性规则：
    - extra（会话元数据）仅允许出现在 done 帧中
    - waiting / message / error 帧禁止携带 extra，messages 只含纯正文
    """
    type: SSEFrameType
    messages: str
    extra: SessionMeta | None = Field(default=None, description="会话元数据，仅 done 帧携带")

    @model_validator(mode="after")
    def _enforce_extra_only_on_done(self):
        """非 done 帧禁止携带 extra 元数据"""
        if self.type != SSEFrameType.DONE and self.extra is not None:
            logger.warning(f"非 done 帧(type={self.type})携带了 extra，已自动清除")
            self.extra = None
        return self


class ErrorResp(BaseModel):
    """错误响应体"""
    code: int
    message: str


class CreateSessionResponse(BaseModel):
    session_id: str


class ChatResponse(BaseModel):
    role: str
    content: str


class HistoryResponse(BaseModel):
    messages: list[ChatResponse]
