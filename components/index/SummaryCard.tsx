import { Scale, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CountUpText } from '@/components/ui-preSettings/CountUpText';
import { Divider } from '@/components/ui-preSettings/Divider';
import { GlassCard } from '@/components/ui-preSettings/GlassCard';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { currencyPrefix } from '@/lib/format';

interface SummaryCardProps {
  // 整区收支汇总值：收入/支出/结余。列表已按页拉取，整区合计无法由分页数据算出，
  // 由专用聚合查询（getSectionSummary RPC）在服务端求和后传入
  summary: { income: number; expense: number; balance: number };
}

// 收支汇总卡预设：置于明细列表上方。上方居中展示结余净额（两行：标签 + 大号金额），
// 分隔线下左右两栏分列收入 / 支出（各配 icon + 标签 + 金额）。
// 汇总值由父组件经聚合查询传入，本组件只负责展示，不参与数据计算；
// 金额统一走 CountUpText 数字滚动预设：从 0 滚动到终值，正负号+货币符号经 prefix 拼在滚动值前，
// 符号由收支方向/余额正负推导，位数与千分位由预设补齐，与明细卡（ItemCard）的数字动效保持一致。
function SummaryCard({ summary }: SummaryCardProps) {
  const { t } = useTranslation();

  // 解构父组件传入的汇总值，口径与首页项目卡（服务端聚合）保持一致
  const { income, expense, balance } = summary;

  return (
    // 液态玻璃预设卡片：渐变背景 + 反光带 + 投影已由 GlassCard 接管；
    // 配色沿用既有语义：结余=主题品牌蓝，收入=绿（text-success），支出=红（text-destructive），亮暗模式自动适配
    <GlassCard className="mb-1.5 gap-2 px-6 pb-2 pt-2">
      {/* 顶部结余区：居中，标签在上、大号金额在下，同为品牌蓝 */}
      <View className="items-center">
        {/* 结余标签：天平图标 + 文字，与下方收支两栏的 icon+文字 结构一致 */}
        <View className="flex-row items-center gap-1.5">
          <Icon as={Scale} size={18} className="text-brand" />
          <Text className="text-lg font-semibold text-brand">{t('home.balance')}</Text>
        </View>
        {/* 结余金额：滚到 |收入-支出|，正负号由余额方向推导（>=0 记 '+￥'，否则 '-￥'），颜色为主题蓝 */}
        <CountUpText
          end={Math.abs(balance)}
          prefix={currencyPrefix(balance >= 0)}
          thousandsSeparator=","
          className="mt-1 text-3xl font-bold tabular-nums text-brand"
        />
      </View>

      {/* 预设下划线：分隔上方结余净额与下方收支两栏 */}
      <Divider className="my-1" />

      {/* 下方左右两栏：左收入（绿）右支出（红），各配 icon + 标签 + 金额；金额滚动到各自合计 */}
      <View className="flex-row">
        {/* 收入栏：进账语义用向上波浪趋势线（TrendingUp），整体绿色 */}
        <View className="flex-1 items-center">
          <View className="flex-row items-center gap-1.5">
            <Icon as={TrendingUp} size={16} className="text-success" />
            <Text className="text-sm font-medium text-success">{t('home.income')}</Text>
          </View>
          <CountUpText
            end={income}
            prefix={currencyPrefix(true)}
            thousandsSeparator=","
            className="mt-1 text-base font-semibold tabular-nums text-success"
          />
        </View>

        {/* 支出栏：出账语义用向下波浪趋势线（TrendingDown），整体红色 */}
        <View className="flex-1 items-center">
          <View className="flex-row items-center gap-1.5">
            <Icon as={TrendingDown} size={16} className="text-destructive" />
            <Text className="text-sm font-medium text-destructive">{t('home.expense')}</Text>
          </View>
          <CountUpText
            end={expense}
            prefix={currencyPrefix(false)}
            thousandsSeparator=","
            className="mt-1 text-base font-semibold tabular-nums text-destructive"
          />
        </View>
      </View>
    </GlassCard>
  );
}

export default SummaryCard;
export { SummaryCard };
