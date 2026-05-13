
# 什么是 uv？

[uv](https://docs.astral.sh/uv/) 是一个用 Rust 编写的极速 Python 包管理工具，替代 pip、venv、pip-tools 等工具，速度提升 10-100 倍。

# 1. 安装 uv

## Windows
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

## macOS/Linux
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## 验证安装
```bash
uv --version
```

# 2. 创建 FastAPI 项目

## 方式一：快速启动（推荐用于原型开发）

```bash
# 创建项目目录
mkdir my-fastapi-app
cd my-fastapi-app

# 初始化项目
uv init

# 添加 FastAPI 依赖
uv add fastapi uvicorn python-dotenv

# 创建 main.py
cat > main.py << 'EOF'
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
EOF

# 运行开发服务器
uv run uvicorn main:app --reload
```

## 方式二：完整项目结构（推荐用于生产）

```bash
# 创建项目
mkdir my-fastapi-app
cd my-fastapi-app
uv init

# 添加依赖
uv add fastapi uvicorn python-dotenv
uv add --dev pytest httpx ruff
```

## 项目结构
```
my-fastapi-app/
├── pyproject.toml      # 项目配置和依赖
├── .venv/              # 虚拟环境（自动创建）
├── README.md
├── .env                # 环境变量
├── .env.example        # 环境变量示例
└── app/
    ├── __init__.py
    ├── main.py         # 应用入口
    ├── config.py       # 配置管理
    ├── routers/        # 路由模块
    │   └── __init__.py
    └── models/         # 数据模型
        └── __init__.py
```

## pyproject.toml 示例
```toml
[project]
name = "my-fastapi-app"
version = "0.1.0"
description = "My FastAPI Application"
readme = "README.md"
requires-python = ">=3.10"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic>=2.9.0",
    "python-dotenv>=1.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "httpx>=0.27.0",
    "ruff>=0.7.0",
]

[tool.ruff]
line-length = 100
target-version = "py310"
```

## app/main.py 示例
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="My API",
    description="API Description",
    version="0.1.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

# 3. 常用 uv 命令

## 依赖管理
```bash
# 安装所有依赖（根据 pyproject.toml）
uv sync

# 添加生产依赖
uv add fastapi

# 添加开发依赖
uv add --dev pytest

# 添加特定版本
uv add "fastapi>=0.115.0"

# 更新依赖
uv sync --upgrade

# 删除依赖
uv remove fastapi
```

## 运行命令
```bash
# 运行 Python 脚本（自动使用虚拟环境）
uv run python main.py

# 运行 uvicorn 服务器
uv run uvicorn main:app --reload


# 运行 pytest
uv run pytest

# 运行 ruff 检查
uv run ruff check .
uv run ruff format .
```
- 查看接口文档

```
http://127.0.0.1:8000/docs
```
## 虚拟环境
```bash
# 手动创建虚拟环境（通常自动创建）
uv venv

# 激活虚拟环境
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac

# 退出虚拟环境
deactivate
```

# 4. 配置镜像源（中国用户）

在 `pyproject.toml` 末尾添加：

```toml
[[tool.uv.index]]
url = "https://pypi.tuna.tsinghua.edu.cn/simple"
default = true
```

或使用阿里云：
```toml
[[tool.uv.index]]
url = "https://mirrors.aliyun.com/pypi/simple"
default = true
```

# 5. Docker 部署

```dockerfile
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

# 复制依赖文件
COPY pyproject.toml ./

# 安装依赖
RUN uv sync --no-dev

# 复制应用代码
COPY app/ ./app/

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

# 6. 常见问题

## Q: uv 和 pip 有什么区别？
**A:** uv 是用 Rust 编写的，速度更快（10-100倍），同时集成了虚拟环境管理、依赖锁定等功能。

## Q: 如何迁移现有的 pip 项目到 uv？
**A:**
```bash
# 在现有项目目录
uv init

# 从 requirements.txt 导入
uv add -r requirements.txt

# 删除旧的 requirements.txt
rm requirements.txt
```

## Q: 如何指定 Python 版本？
**A:**
```bash
# 创建项目时指定
uv init --python 3.11

# 或在 pyproject.toml 中修改
requires-python = ">=3.11"
```

# 参考链接

- [uv 官方文档](https://docs.astral.sh/uv/)
- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [PyPI 清华镜像](https://mirrors.tuna.tsinghua.edu.cn/help/pypi/)
