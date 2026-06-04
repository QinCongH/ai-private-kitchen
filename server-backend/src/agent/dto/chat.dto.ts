import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatDto {
  @ApiProperty({ description: '用户输入内容', minLength: 1, maxLength: 4096 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  query!: string;

  @ApiPropertyOptional({ description: '会话 ID，不传则创建新会话' })
  @IsString()
  @IsOptional()
  session_id?: string;

  @ApiPropertyOptional({ description: '图片 URL，支持多模态输入' })
  @IsString()
  @IsOptional()
  image_url?: string;
}
