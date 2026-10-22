import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

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

/** 单条友链（协议白名单在 ConfigService.normalizeFriends 里二次校验） */
class FriendLinkDto {
  @IsString()
  @MaxLength(40)
  name!: string;

  @IsString()
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  description?: string;
}

export class UpdateFriendsDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  intro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  applyHint?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FriendLinkDto)
  links?: FriendLinkDto[];
}
