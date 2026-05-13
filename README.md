```plan
ai-agent-platform/
│
├── 📁 agent-backend/                     # ③ 智能体后端
│   ├── app/
│   │   ├── main.py                       # FastAPI 入口
│   │   ├── api/
│   │   │   ├── chat.py                   # /chat 流式对话
│   │   │   └── sessions.py               # 会话管理
│   │   ├── core/
│   │   │   └── config.py                 # AGENT_ 前缀配置
│   │   ├── agents/
│   │   │   ├── base.py
│   │   │   └── react.py                  # ReAct 推理循环
│   │   ├── models/                       # LLM 接入
│   │   │   ├── client.py
│   │   │   └── router.py
│   │   ├── memory/
│   │   │   ├── short_term.py             # Redis
│   │   │   └── long_term.py              # 向量库
│   │   ├── tools/
│   │   │   ├── registry.py               # 工具注册中心
│   │   │   ├── executor.py               # 工具执行器
│   │   │   └── biz_client.py             # 调用业务后端的客户端
│   │   └── schemas/
│   │       └── agent.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── 📁 business-backend/                  # ④ 业务后端
│   ├── src/
│   │   ├── main/                         # Spring Boot / Go / Node
│   │   ├── controller/
│   │   │   ├── UserController.java
│   │   │   └── OrderController.java
│   │   ├── service/                      # 核心业务逻辑
│   │   │   ├── OrderService.java
│   │   │   └── PaymentService.java
│   │   ├── repository/                   # 数据访问
│   │   ├── domain/                       # 领域模型
│   │   └── internal/                     # 内部接口（仅 Agent 调用）
│   │       ├── AgentToolController.java  # 工具接口
│   │       └── dto/
│   │           └── ToolRequest.java
│   └── Dockerfile
│
├── 📁 shared/                            # 共享契约（可选）
│   └── proto/
│       └── tools.proto                   # gRPC 定义
│
├── 📁 frontend/                          # ① 前端
├── 📁 gateway/                           # ② 网关（Kong/Nginx）
├── 📁 infra/
│   └── docker-compose.yml                # 多服务编排
└── README.md
```