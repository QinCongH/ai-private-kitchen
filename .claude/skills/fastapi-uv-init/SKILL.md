# FastAPI + uv 项目初始化

## 描述

使用 uv 包管理器快速创建和配置 FastAPI 项目，包括依赖安装、项目结构初始化和开发服务器启动。

## 标签

python, fastapi, uv, web, api

## 使用方法

```
/fastapi-uv-init [项目目录]
```

## 参数

- `项目目录` (可选): 指定创建项目的目录，默认为当前目录

## 功能

1. 检查 uv 是否已安装，如未安装则提供安装命令
2. 在当前目录或指定目录初始化 uv 项目
3. 添加必要的依赖：fastapi、uvicorn、python-dotenv
4. 可选：添加开发依赖 pytest、httpx、ruff
5. 创建基本的项目结构：
 例如.
├── backend
│   ├── main.py
│   ├── __init__.py
等，符合生产规范的项目目录
6. 运行 uv sync 安装依赖
7. 提供启动命令：uv run uvicorn main:app --reload

## 注意事项

- 如果目录已存在文件，会询问用户是否覆盖或合并
- 默认使用清华 PyPI 镜像加速下载

## 示例

```
/fastapi-uv-init
在当前目录创建 FastAPI 项目

/fastapi-uv-init my-api
在 my-api 目录创建 FastAPI 项目
```
