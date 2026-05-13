from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class BaseResponse(BaseModel):
    """基础响应模型"""
    model_config = ConfigDict(from_attributes=True)

    code: int = 200
    message: str = "success"
    data: Optional[dict] = None


class HealthCheck(BaseModel):
    """健康检查响应"""
    status: str = "ok"
    version: str = "0.1.0"
    timestamp: datetime
