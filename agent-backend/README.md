# Agent Backend

基于 FastAPI + uv 构建的 AI Agent 后端服务。

## 项目结构

```
.
├── backend/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口
│   ├── api/                 # API 路由
│   │   ├── __init__.py
│   │   └── router.py
│   ├── core/                # 核心配置
│   │   ├── __init__.py
│   │   └── config.py
│   ├── models/              # 数据模型
│   │   ├── __init__.py
│   │   └── base.py
│   ├── services/            # 业务逻辑服务
│   │   └── __init__.py
│   └── tests/               # 测试用例
│       └── __init__.py
├── .env                     # 环境变量（从 .env.example 复制）
├── .env.example             # 环境变量示例
├── pyproject.toml           # 项目配置
└── README.md                # 项目说明
```

## 快速开始

### 1. 环境配置

复制环境变量文件：

```bash
cp .env.example .env
```

根据需要编辑 `.env` 文件。

### 2. 安装依赖

```bash
uv sync
```

### 3. 启动开发服务器

```bash
uv run uvicorn backend.main:app --reload
```

或指定主机和端口：

```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. 访问 API

- API 文档: http://localhost:8000/docs
- 备用文档: http://localhost:8000/redoc
- 健康检查: http://localhost:8000/api/v1/agent/health

## 开发

### 运行测试

```bash
uv run pytest
```

### 代码格式化

```bash
uv run ruff check .
uv run ruff format .
```

## 部署

生产环境启动：

```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
