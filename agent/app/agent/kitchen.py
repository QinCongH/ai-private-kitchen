# 引入全局变量
from dotenv import load_dotenv
import os

load_dotenv()

# 引入模型
from langchain.chat_models import init_chat_model

model = init_chat_model(
    model="GLM-4.1V-Thinking-Flash",
    model_provider="openai",
    base_url=os.getenv("ZHIPU_BASE_URL"),
    api_key=os.getenv("ZHIPU_API_KEY"),
)
# %%
# 创建记忆总结中间件
# langchain提供的checkpointer的默认实现，基于内存存储
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware

# 初始化中间件
middleware = SummarizationMiddleware(
    model=model,
    trigger=("messages", 3),  # 触发时机，当消息数超过3时，进行总结
    keep=("messages", 1)  # 保留的会话数，超过2条
)
# %%
# 设定系统提示词
system_prompt = """  
你是一名私人厨师。收到用户提供的食材照片或清单后，请按以下流程操作：  
1.识别和评估食材：若用户提供照片，首先辨识所有可见食材。基于食材的外观状态，评估其新鲜度与可用量，整理出一份“当前可用食材清单”。  
2.智能食谱检索：优先调用 web_search 工具，以“可用食材清单”为核心关键词，查找可行菜谱。  
3.多维度评估与排序：从营养价值和制作难度两个维度对检索到的候选食谱进行量化打分，并根据得分排序，制作简单且营养丰富的排名靠前。  
4.结构化方案输出：把排序后的食谱整理为一份结构清晰的建议报告，要包含食谱信息、得分、推荐理由、食谱的参考图片，帮助用户快速做出决策。  

请严格按照流程，优先调用 web_search 工具搜索食谱，搜索不到的情况下才能自己发挥。  
"""
# %%
# 引入持久化记忆
import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver

# 初始化checkpointer
checkpointer = SqliteSaver(sqlite3.connect("checkpoint.db", check_same_thread=False))
# 自动建表
checkpointer.setup()
# %%
# 引入工具
from langchain_tavily import TavilySearch

# 初始化工具，并设置参数，具体参数设置参考官网
tavilyTool = TavilySearch(
    max_results=5,
    topic="general")
from langchain.messages import HumanMessage

multimodal_message = HumanMessage(
    content=[
        {"type": "image",
         "url": "https://img.freepik.com/free-photo/arrangement-different-foods-organized-fridge_23-2149099882.jpg"},
        {"type": "text", "text": "烤鸡肉配蔬菜详细说一下怎么做呢"}
    ])
# %%
# 创建智能体
from langchain.agents import create_agent

agent = create_agent(
    model=model,
    system_prompt=system_prompt,
    checkpointer=checkpointer,
    tools=[tavilyTool],
    middleware=[middleware]
)
# 输出测试
from langchain.messages import HumanMessage

config = {"configurable": {"thread_id": "thread_1"}}
# 第一次提问
for token, metadata in agent.stream({
    "messages": [multimodal_message]
}, stream_mode="messages",config=config):
    if token.content:
        print(token.content, end="", flush=True)