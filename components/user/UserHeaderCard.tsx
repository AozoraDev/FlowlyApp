import { CalendarDays, User as UserIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

interface UserHeaderCardProps {
  // 头像地址；为空时用品牌蓝占位图标兜底，避免破图
  avatarUrl?: string | null;
  // 显示名（用户名 / 邮箱前缀 / 游客兜底）
  displayName: string;
  // 已本地化的「加入时间 · 日期」整段文案
  memberSinceLabel: string;
}

// 用户信息头卡：品牌蓝浅底，集中展示头像、显示名与加入时间。
// 头像缺失时用「白色圆底 + 品牌蓝人形图标」占位；纯展示，无交互。
function UserHeaderCard({ avatarUrl, displayName, memberSinceLabel }: UserHeaderCardProps) {
  return (
    <Card className="items-center gap-0 rounded-2xl border-0 bg-brand-soft p-6 shadow-none">
      <Avatar className="size-20" alt={displayName}>
        {avatarUrl ? (
          <AvatarImage source={{ uri: avatarUrl }} />
        ) : (
          <AvatarFallback className="bg-white">
            <Icon as={UserIcon} size={40} className="text-brand" />
          </AvatarFallback>
        )}
      </Avatar>
      <Text className="mt-3 text-xl font-bold text-brand">{displayName}</Text>
      <View className="mt-1 flex-row items-center gap-1">
        <Icon as={CalendarDays} size={14} className="text-muted-foreground" />
        <Text className="text-sm text-muted-foreground">{memberSinceLabel}</Text>
      </View>
    </Card>
  );
}

export default UserHeaderCard;
export { UserHeaderCard };
