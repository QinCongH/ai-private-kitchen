import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({ description: '状态码', example: 200 })
  code: number;

  @ApiProperty({ description: '消息', example: 'success' })
  message: string;

  @ApiProperty({ description: '数据' })
  data: T;
}
