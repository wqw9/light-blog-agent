import type { FriendsConfig } from '@myblog/shared';
import { request } from './client';

export type { FriendLink, FriendsConfig } from '@myblog/shared';

/** 友链数据（config/friends.json，公开读取，实时生效） */
export function getFriends(): Promise<FriendsConfig> {
  return request<FriendsConfig>('/api/site/friends');
}

/** 保存友链（管理页「友链」标签；需要管理口令） */
export function updateFriends(payload: Partial<FriendsConfig>): Promise<FriendsConfig> {
  return request<FriendsConfig>('/api/site/friends', { method: 'PUT', body: JSON.stringify(payload) });
}
