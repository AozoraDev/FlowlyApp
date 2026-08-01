import { Text } from '@/components/ui/text';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCountUp, type EasingFn } from 'use-count-up';

interface CountUpTextProps extends Omit<React.ComponentProps<typeof Text>, 'children'> {
  // 目标数值：首次就绪时从 0 滚动到此值，之后不再重播
  end: number;
  // 滚动时长（秒），默认 0.5
  duration?: number;
  // 小数位数上限，默认 2；实际小数位按 end 推导（去掉尾零），动画期间始终与终值一致
  decimalPlaces?: number;
  // 千分位分隔符（如 ','），默认不分隔
  thousandsSeparator?: string;
  // 前缀/后缀装饰（如 +、-、$），不参与位数统计
  prefix?: string;
  suffix?: string;
}

// easeOutQuart：起步缓、收尾滑，比 use-count-up 默认的 easeOutCubic（起步冲刺、易显生硬）更丝滑
const easeOutQuart: EasingFn = (t, b, c, d) => {
  const x = t / d - 1;
  return c * (1 - x * x * x * x) + b;
};

// 取一个小数的位数（12.5 → 1，12.56 → 2，12 → 0）
const decimalsOf = (n: number) => {
  if (!Number.isFinite(n)) return 0;
  const s = Math.abs(n).toString();
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
};

// 由终值推导「显示形状」：小数位（去尾零并封顶）+ 整数位数，动画全程按此补齐
function getShape(end: number, decimalPlaces: number) {
  const dec = Math.min(decimalPlaces, decimalsOf(end));
  const intLen = Math.abs(end).toFixed(dec).split('.')[0].length;
  return { intLen, dec };
}

// 将动画中的值格式化为固定位数：整数高位补零 + 小数位恒定，宽度不随位数增长而跳动
function formatStable(
  value: number,
  shape: { intLen: number; dec: number },
  thousandsSeparator?: string
) {
  const [intPart, fracPart] = Math.abs(value).toFixed(shape.dec).split('.');
  let padded = intPart.padStart(shape.intLen, '0');
  if (thousandsSeparator) {
    padded = padded.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  }
  return shape.dec > 0 ? `${padded}.${fracPart}` : padded;
}

// 数字滚动文本：统一封装 use-count-up，业务页面只传数值、不直接依赖第三方库。
// 「首次进入」语义：等 end 首次变为有限数值才开启动画（避免异步数据未到时对 0 空转），
// 动画只播一次——use-count-up 在时长结束后停止推进帧循环，后续 end 变化直接跳到新终值而不重播。
// 位数一致性：用终值推导目标位数，动画期间整数高位补零、小数位固定，跳动过程宽度稳定。
function CountUpText({
  end,
  duration = 0.5,
  decimalPlaces = 2,
  thousandsSeparator,
  prefix = '',
  suffix = '',
  ...textProps
}: CountUpTextProps) {
  // isCounting 初始 false：end 未就绪时不计数，首次就绪后才置 true 开播
  const [isCounting, setIsCounting] = useState(false);
  // 已开播标记：防止后续 end 更新触发第二次滚动
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current && Number.isFinite(end)) {
      startedRef.current = true;
      setIsCounting(true);
    }
  }, [end]);

  // 目标显示形状只依赖终值，动画期间保持不变
  const shape = useMemo(() => getShape(end, decimalPlaces), [end, decimalPlaces]);

  // 用恒等 formatter 拿原始滚动值，位数补齐统一在本组件处理
  const { value } = useCountUp({
    isCounting,
    end,
    duration,
    easing: easeOutQuart,
    formatter: (v) => v,
  });

  const display = `${prefix}${formatStable(Number(value), shape, thousandsSeparator)}${suffix}`;

  return <Text {...textProps}>{display}</Text>;
}

export default CountUpText;
export { CountUpText };
