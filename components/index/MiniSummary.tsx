import { Scale, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CountUpText } from '@/components/ui-preSettings/CountUpText';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { currencyPrefix } from '@/lib/format';

interface MiniSummaryProps {
  // 项目收支汇总：收入/支出/结余，由父组件经服务端聚合查询传入
  summary: { income: number; expense: number; balance: number };
}

// 迷你收支汇总：紧凑单行三列（左收入 / 中支出 / 右结余），用于项目卡片内的快速预览。
// 图标沿用波浪趋势线语义：收入 TrendingUp（向上波浪线）、支出 TrendingDown（向下波浪线）、结余 Scale（天平）；
// 配色沿用既有语义：收入绿、支出红、结余主题品牌蓝，亮暗模式自动适配；
// 金额统一走 CountUpText 数字滚动预设，正负号+货币符号经 prefix 拼在滚动值前，
// 与明细卡（ItemCard）、汇总卡（SummaryCard）的数字动效保持一致。
function MiniSummary({ summary }: MiniSummaryProps) {
  const { t } = useTranslation();

  return (
    <View className="mt-2 flex-row justify-between">
      {/* 收入列：进账语义用绿色 */}
      <View className="flex-1 items-start gap-0.5">
        <View className="flex-row items-center gap-1">
          <Icon as={TrendingUp} size={12} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">{t('home.income')}</Text>
        </View>
        <CountUpText
          end={summary.income}
          prefix={currencyPrefix(true)}
          thousandsSeparator=","
          className="text-sm font-semibold tabular-nums text-success"
        />
      </View>
      {/* 支出列：出账语义用红色 */}
      <View className="flex-1 items-start gap-0.5">
        <View className="flex-row items-center gap-1">
          <Icon as={TrendingDown} size={12} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">{t('home.expense')}</Text>
        </View>
        <CountUpText
          end={summary.expense}
          prefix={currencyPrefix(false)}
          thousandsSeparator=","
          className="text-sm font-semibold tabular-nums text-destructive"
        />
      </View>
      {/* 结余列：取绝对值展示，正负号由余额方向推导，颜色为主题品牌蓝 */}
      <View className="flex-1 items-start gap-0.5">
        <View className="flex-row items-center gap-1">
          <Icon as={Scale} size={12} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">{t('home.balance')}</Text>
        </View>
        <CountUpText
          end={Math.abs(summary.balance)}
          prefix={currencyPrefix(summary.balance >= 0)}
          thousandsSeparator=","
          className="text-sm font-semibold tabular-nums text-brand"
        />
      </View>
    </View>
  );
}

export default MiniSummary;
export { MiniSummary };
