from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from backend.core.config import get_settings
from backend.api.router import router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时执行
    print(f"🚀 {settings.app_name} v{settings.app_version} 启动中...")
    yield
    # 关闭时执行
    print(f"👋 {settings.app_name} 已关闭")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI Agent Backend API",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
)

# 注册路由
app.include_router(router, prefix=settings.api_prefix)


@app.get("/")
async def root():
    """根路径"""
    return {"message": f"欢迎使用 {settings.app_name}", "version": settings.app_version}
