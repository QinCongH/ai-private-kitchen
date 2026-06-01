import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ChatDto } from './dto/chat.dto';
import {
  ChatResponse,
  SessionMessagesResponse,
} from './interfaces/chat.interface';

@Injectable()
export class AgentService {
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'langchainApiBaseUrl',
      'http://localhost:8000',
    );
  }

  async chat(chatDto: ChatDto): Promise<ChatResponse> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/agent/chat`, chatDto),
      );
      return data;
    } catch (error) {
      this.handleError(error, '消息发送失败');
    }
  }

  async createSession(): Promise<{ session_id: string }> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/api/agent/session`),
      );
      return data;
    } catch (error) {
      this.handleError(error, '创建会话失败');
    }
  }

  async getMessages(sessionId: string): Promise<SessionMessagesResponse> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/api/agent/session/${sessionId}/messages`,
        ),
      );
      return data;
    } catch (error) {
      this.handleError(error, '获取消息历史失败');
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(
          `${this.baseUrl}/api/agent/session/${sessionId}`,
        ),
      );
    } catch (error) {
      this.handleError(error, '删除会话失败');
    }
  }

  private handleError(error: any, message: string): never {
    const status = error?.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const detail = error?.response?.data?.message ?? message;
    throw new HttpException({ code: status, message: detail }, status);
  }
}
