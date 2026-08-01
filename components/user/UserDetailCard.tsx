import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface UserDetailCardProps {
  // 字段名（一般传 i18n 文案）
  label: string;
  // 字段值；空值兜底由调用方传入
  value: string;
  // 透传给 Card 的附加类（间距等）
  className?: string;
}

// 详情卡片：白底圆角，单行展示「字段名 + 字段值」，两列两端对齐。
// 纯展示组件，i18n 与数据兜底均由调用方拼好传入。
function UserDetailCard({ label, value, className }: UserDetailCardProps) {
  return (
    <Card className={cn('mt-4 rounded-2xl p-4 shadow-none', className)}>
      <View className="flex-row items-center justify-between gap-4">
        <Text className="text-sm text-muted-foreground">{label}</Text>
        <Text className="flex-1 text-right text-sm">{value}</Text>
      </View>
    </Card>
  );
}

export default UserDetailCard;
export { UserDetailCard };
