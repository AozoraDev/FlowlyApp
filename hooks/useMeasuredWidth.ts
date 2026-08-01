import { useCallback, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

// 测量容器像素宽度：把 onLayout 挂到容器上即可拿到实时宽度。
// 用于按容器宽度做比例截断（如卡片标题按卡片宽度的 60% 截断）等布局相关计算
export function useMeasuredWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);
  return { width, onLayout };
}
