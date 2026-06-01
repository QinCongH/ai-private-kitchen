# 引入全局变量
from dotenv import load_dotenv
import os

load_dotenv()

# 引入模型
from langchain.chat_models import init_chat_model
from langgraph.checkpoint.mysql import PyMySQLSaver
from langgraph.graph import StateGraph, MessagesState, START, END
from langchain_core.messages import HumanMessage

# 初始化模型
model = init_chat_model(
    model="glm-5",
    model_provider="openai",
    base_url=os.getenv("AUTO_BASE_URL"),
    api_key=os.getenv("AUTO_API_KEY"),
)

# 定义聊天节点函数
def chat_node(state: MessagesState):
    """处理聊天消息的节点"""
    response = model.invoke(state["messages"])
    return {"messages": [response]}

# 创建状态图
workflow = StateGraph(MessagesState)

# 添加聊天节点
workflow.add_node("chat", chat_node)

# 添加边：从开始到聊天节点
workflow.add_edge(START, "chat")

# 添加边：从聊天节点结束
workflow.add_edge("chat", END)

# 配置 MySQL 连接字符串（从环境变量读取）
mysql_host = os.getenv("MYSQL_HOST", "localhost")
mysql_port = os.getenv("MYSQL_PORT", "3306")
mysql_user = os.getenv("MYSQL_USER", "root")
mysql_password = os.getenv("MYSQL_PASSWORD", "")
mysql_db = os.getenv("MYSQL_DB", "langgraph")

# 构建连接字符串
DB_URI = f"mysql+pymysql://{mysql_user}:{mysql_password}@{mysql_host}:{mysql_port}/{mysql_db}"

# 创建 MySQL 检查点存储并运行
with PyMySQLSaver.from_conn_string(DB_URI) as checkpointer:
    # 初始化数据库表（首次运行需要）
    checkpointer.setup()

    # 编译图，传入检查点存储
    graph = workflow.compile(checkpointer=checkpointer)

    # 配置线程 ID（用于区分不同会话的记忆）
    config = {"configurable": {"thread_id": "user_001"}}

    # 测试 1: 第一次对话
    print("=" * 50)
    print("第一次对话：")
    response1 = graph.invoke(
        {"messages": [HumanMessage(content="你好，我是小黑")]},
        config=config
    )
    for msg in response1["messages"]:
        msg.pretty_print()

    # 测试 2: 第二次对话（应该记得名字）
    print("\n" + "=" * 50)
    print("第二次对话（测试记忆）：")
    response2 = graph.invoke(
        {"messages": [HumanMessage(content="还记得我叫什么吗？")]},
        config=config
    )
    for msg in response2["messages"]:
        msg.pretty_print()
