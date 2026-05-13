from fastapi import APIRouter
from datetime import datetime
from backend.models.base import HealthCheck, BaseResponse

router = APIRouter(prefix="/agent", tags=["Agent"])


@router.get("/health", response_model=HealthCheck)
async def health_check():
    """健康检查接口"""
    return HealthCheck(timestamp=datetime.now())


@router.get("/info", response_model=BaseResponse)
async def get_info():
    """获取应用信息"""
    return BaseResponse(data={"name": "Agent Backend", "version": "0.1.0"})
