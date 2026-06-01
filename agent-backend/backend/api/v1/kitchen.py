from fastapi import APIRouter
from starlette.responses import StreamingResponse

from backend.models.base import BaseResponse
from backend.models.kitchen import ChatRequest
from backend.services.kitchen_service import kitchen_service

router = APIRouter(prefix="/kitchen", tags=["Kitchen"])


@router.post("/chat")
async def chat(request: ChatRequest):
    """流式聊天接口（SSE）"""
    return StreamingResponse(
        kitchen_service.stream_chat(
            message=request.message,
            thread_id=request.thread_id,
            image_url=request.image_url,
        ),
        media_type="text/event-stream",
    )


@router.get("/history/{thread_id}", response_model=BaseResponse)
async def get_history(thread_id: str):
    """获取历史消息"""
    messages = kitchen_service.get_history(thread_id)
    return BaseResponse(data={"thread_id": thread_id, "messages": messages})


@router.delete("/history/{thread_id}", response_model=BaseResponse)
async def clear_history(thread_id: str):
    """清空历史消息"""
    success = kitchen_service.clear_history(thread_id)
    if success:
        return BaseResponse(message="历史消息已清空", data={"thread_id": thread_id})
    return BaseResponse(code=500, message="清空历史消息失败")
