import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

// 按压弹簧缩放反馈：按下缩到 pressedScale（默认 0.96），松手回弹，给按钮/胶囊"物理感"。
// 返回 style 挂到组件上，onPressIn/onPressOut 需与业务处理器组合调用（先动画后业务）。
export function usePressScale(pressedScale = 0.96) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return {
    style,
    onPressIn: () => {
      scale.value = withSpring(pressedScale, { damping: 20, stiffness: 300 });
    },
    onPressOut: () => {
      scale.value = withSpring(1, { damping: 17, stiffness: 260 });
    },
  };
}
