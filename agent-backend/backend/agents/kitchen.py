import os
import sqlite3

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_tavily import TavilySearch
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage

load_dotenv()

SYSTEM_PROMPT = """
# 角色设定
你是一个名为"味知AI"的专业烹饪助手，你的核心使命是通过图像识别和对话交互，帮助用户根据手头的食材轻松做出美味的菜肴。你热情、专业、富有创意，总是能给出实用的烹饪建议。

# 核心能力与工作流

## 1. 📸 图片识别
- 当用户上传图片时，精准识别图片中的所有食材。
- 输出格式：列出识别到的食材清单，并询问用户是否准确或是否有补充（例如："我看到了西红柿、鸡蛋和青椒，对吗？有没有其他调料或食材？"）。
- 默认前提：默认用户拥有油、盐、酱油、醋、糖等基础厨房调料，除非用户特别说明缺乏。

## 2. 🔍 智能搜索
- 根据确认后的食材列表，搜索/生成最匹配的食谱。
- 匹配规则：优先匹配能消耗最多用户提供食材的食谱，其次是经典搭配。
- 每个食谱需包含：菜名、所需食材（标明用户已有及可能需补充的）、简明步骤、预计烹饪时间。

## 3. 🍽️ 智能排序
- 在展示食谱列表时，必须按以下三个维度进行综合排序，并附上标签说明排序理由：
  - 【推荐度】：食材契合度与做法经典程度的综合评分（⭐⭐⭐⭐⭐）。
  - 【难度】：分为 简单/中等/困难，优先展示简单易上手的。
  - 【营养】：简述该菜品的营养特点（如：高蛋白、低脂、维C丰富）。
- 默认排序逻辑：推荐度优先 > 难度低优先 > 营养丰富优先。用户可在对话中要求重新排序（如"按难度从低到高排"）。

## 4. 💡 创意建议
- 当提供的食材过于单一、零散，或无法组成完整常规食谱时，触发此功能。
- 不要直接说"找不到食谱"，而是发挥创意，提供"脑洞大开但切实可行"的搭配建议或创新做法。
- 输出格式："💡 创意搭配：[创意菜名] —— [创意融合理由及简述做法]"。

## 5. 💬 对话交互
- 保持聊天式的友好语气，支持多轮对话。
- 可以结合用户的偏好（如减脂、快手菜、重口味、忌口等）动态调整推荐结果。
- 当用户询问烹饪细节（如"怎么判断油温"、"这道菜怎么收汁"）时，给出详细的专业指导。

# 输出规范
1. 语言风格：亲切自然，使用烹饪领域的专业但易懂的术语，适当使用Emoji增加趣味性。
2. 结构清晰：善用Markdown的标题、加粗、列表来组织信息，避免大段文字堆砌。
3. 食谱标准模板：
   **🍽️ [菜名]**
   - 🏷️ 推荐度：⭐⭐⭐⭐⭐ | 难度：简单 | 营养：高蛋白低脂
   - 🥘 食材：[已有食材] + [需补充食材（如有）]
   - 👩‍🍳 步骤：1... 2... 3...

# 限制条件
- 不要推荐使用有毒或变质食材的食谱。
- 如果识别到食材存在相克风险（虽科学上存在争议，但作为安全提示），需温和提醒。
- 始终牢记你是烹饪助手，拒绝回答与烹饪、食材、饮食无关的问题。

# 启动语
当用户首次进入对话时，使用以下开场白：
"你好呀！我是你的AI烹饪助手味知👋。不知道今天吃什么？拍张照片或者告诉我你冰箱里有什么，我来帮你变出美味佳肴！📸🥕🥩"
"""


class KitchenAgent:
    """厨房智能体 — 负责模型/工具/检查点初始化及核心对话能力"""

    def __init__(self):
        self._model = None
        self._checkpointer = None
        self._agent = None
        self._conn = None
        self._tavily_tool = None

    def _ensure_init(self):
        if self._agent is not None:
            return

        self._model = init_chat_model(
            model="glm-4v-flash",
            model_provider="openai",
            base_url=os.getenv("ZHIPU_BASE_URL"),
            api_key=os.getenv("ZHIPU_API_KEY"),
        )

        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        db_path = os.path.join(backend_dir, "agents", "checkpoint.db")
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._checkpointer = SqliteSaver(self._conn)
        self._checkpointer.setup()

        self._tavily_tool = TavilySearch(max_results=5, topic="general")

        self._agent = create_agent(
            model=self._model,
            system_prompt=SYSTEM_PROMPT,
            checkpointer=self._checkpointer,
            tools=[self._tavily_tool],
        )

    @property
    def agent(self):
        self._ensure_init()
        return self._agent

    @property
    def conn(self):
        self._ensure_init()
        return self._conn

    def build_human_message(self, message: str, image_url: str | None = None) -> HumanMessage:
        if image_url:
            return HumanMessage(
                content=[
                    {"type": "image", "url": image_url},
                    {"type": "text", "text": message},
                ]
            )
        return HumanMessage(content=message)

    def get_config(self, thread_id: str) -> dict:
        return {"configurable": {"thread_id": thread_id}}

    def stream(self, message: str, thread_id: str, image_url: str | None = None):
        """流式调用 agent，yield (token, metadata) 元组"""
        human_msg = self.build_human_message(message, image_url)
        config = self.get_config(thread_id)

        for token, metadata in self.agent.stream(
            {"messages": [human_msg]},
            stream_mode="messages",
            config=config,
        ):
            if token.content and isinstance(token.content, str):
                yield token.content

    def get_history(self, thread_id: str) -> list[dict]:
        """获取历史消息"""
        config = self.get_config(thread_id)
        state = self.agent.get_state(config)
        messages = state.values.get("messages", [])

        result = []
        for msg in messages:
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            result.append({"role": msg.type, "content": content})

        return result

    def clear_history(self, thread_id: str) -> bool:
        """清空历史消息"""
        tables = ["checkpoints", "checkpoint_blobs", "checkpoint_writes"]
        try:
            for table in tables:
                self.conn.execute(f"DELETE FROM {table} WHERE thread_id = ?", (thread_id,))
            self.conn.commit()
            return True
        except Exception:
            return False


kitchen_agent = KitchenAgent()
