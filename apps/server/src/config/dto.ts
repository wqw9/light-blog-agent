import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

class TimelineItemDto {
  @IsString()
  year!: string;

  @IsString()
  event!: string;
}

class LinkItemDto {
  @IsString()
  label!: string;

  @IsString()
  url!: string;
}

export class UpdateAboutDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimelineItemDto)
  timeline?: TimelineItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkItemDto)
  links?: LinkItemDto[];

  /** Markdown 正文：介绍页自由扩展内容 */
  @IsOptional()
  @IsString()
  content?: string;
}
