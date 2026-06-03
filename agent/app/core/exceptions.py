class AgentException(Exception):
    """Agent 层业务异常基类"""

    def __init__(self, message: str, code: int = 500):
        self.message = message
        self.code = code
        super().__init__(message)


class LLMCallException(AgentException):
    """LLM API 调用失败"""
    pass


class SessionNotFoundException(AgentException):
    """会话不存在"""

    def __init__(self, session_id: str):
        super().__init__(f"会话不存在: {session_id}", code=404)
