import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ChatDto } from './dto/chat.dto';
import { CreateSessionResponse, SessionMessagesResponse } from './interfaces/chat.interface';

@Injectable()
export class AgentService {
  private readonly baseUrl: string|undefined;
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    console.log("this.configService.get('langchainApiBaseUrl')",this.configService.get('langchainApiBaseUrl'))
    this.baseUrl = this.configService.get('langchainApiBaseUrl');
  }

  /**
   * 获取下游 SSE 流式响应，返回 axios 响应对象（支持流式读取）
   */
  async getChatStream(chatDto: ChatDto) {
    const url = chatDto.session_id
      ? `${this.baseUrl}/agent/chat/${chatDto.session_id}`
      : `${this.baseUrl}/agent/chat`;

    const body: Record<string, string> = { query: chatDto.query };
    if (chatDto.image_url) body.image_url = chatDto.image_url;
    if (chatDto.session_id) body.session_id = chatDto.session_id;

    try {
       console.log("this.configService.get('langchainApiBaseUrl')",this.configService.get('langchainApiBaseUrl'))
      const response = await this.httpService.axiosRef.post(url, body, {
        responseType: 'stream',
        timeout: 300_000,
        headers: { 'Content-Type': 'application/json' },
      });
      return response.data;
    } catch (error: any) {
      if (error?.response) {
        const status = error.response.status;
        this.logger.error(`下游 API 响应异常: ${status}`);
        throw new HttpException(
          { code: status, message: `下游服务错误 (${status})` },
          status,
        );
      }
      this.logger.error(`连接下游 API 失败: ${error?.message ?? error}`);
      throw new HttpException(
        { code: HttpStatus.BAD_GATEWAY, message: '无法连接到 Agent 服务' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** 创建新会话 */
  async createSession(): Promise<CreateSessionResponse> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/agent/session`),
      );
      return data;
    } catch (error) {
      this.handleError(error, '创建会话失败');
    }
  }

  /** 获取会话历史 */
  async getMessages(sessionId: string): Promise<SessionMessagesResponse> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/agent/history/${sessionId}`),
      );
      return data;
    } catch (error) {
      this.handleError(error, '获取消息历史失败');
    }
  }

  /** 删除会话 */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}/agent/session/delete/${sessionId}`),
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
