import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Res,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProduces } from '@nestjs/swagger';
import type { Response } from 'express';
import { AgentService } from './agent.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('Agent')
@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'SSE 流式对话',
    description:
      '接收用户消息，以 Server-Sent Events 格式流式返回 LLM 回复。不传 session_id 时自动创建新会话。',
  })
  @ApiProduces('text/event-stream')
  async chat(@Body() chatDto: ChatDto, @Res() res: Response) {
    const stream = await this.agentService.getChatStream(chatDto);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    stream.pipe(res);

    stream.on('error', (err: Error) => {
      this.logger.error(`SSE 流转发异常: ${err.message}`);
      res.end();
    });
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
