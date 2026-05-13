# 引入全局变量
from dotenv import load_dotenv
import os

load_dotenv()

# 引入模型
from langchain.chat_models import init_chat_model

model = init_chat_model(
    model="glm-5",
    model_provider="openai",
    base_url=os.getenv("AUTO_BASE_URL"),
    api_key=os.getenv("AUTO_API_KEY"),
)