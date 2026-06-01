import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('Agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送消息到 Agent' })
  async chat(@Body() chatDto: ChatDto) {
    return this.agentService.chat(chatDto);
  }

  @Post('session')
  @ApiOperation({ summary: '创建新会话' })
  async createSession() {
    return this.agentService.createSession();
  }

  @Get('session/:session_id/messages')
  @ApiOperation({ summary: '获取会话历史消息' })
  async getMessages(@Param('session_id') sessionId: string) {
    return this.agentService.getMessages(sessionId);
  }

  @Delete('session/:session_id')
  @ApiOperation({ summary: '删除会话' })
  async deleteSession(@Param('session_id') sessionId: string) {
    await this.agentService.deleteSession(sessionId);
    return { message: '会话已成功删除' };
  }
}
