import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface UserDetailRow {
  // 字段名（一般传 i18n 文案）
  label: string;
  // 字段值；空值兜底由调用方传入
  value: string;
}

interface UserDetailCardProps {
  // 字段列表：一行一项，全部收进同一个卡片，行间用细分隔线隔开
  rows: UserDetailRow[];
  // 透传给 Card 的附加类（间距等）
  className?: string;
}

// 详情卡片：白底圆角，多行展示「字段名 + 字段值」，每行两列两端对齐。
// 纯展示组件，i18n 与数据兜底均由调用方拼好传入。
function UserDetailCard({ rows, className }: UserDetailCardProps) {
  return (
    // gap-1 覆盖 Card 默认 gap-6（24px），行间几乎紧贴；twMerge 自动合并
    <Card className={cn('mt-4 gap-1 rounded-2xl p-4 shadow-none', className)}>
      {rows.map(({ label, value }) => (
        <View key={label} className="flex-row items-center justify-between gap-4">
          <Text className="text-sm text-muted-foreground">{label}</Text>
          <Text className="flex-1 text-right text-sm">{value}</Text>
        </View>
      ))}
    </Card>
  );
}

export default UserDetailCard;
export { UserDetailCard };
