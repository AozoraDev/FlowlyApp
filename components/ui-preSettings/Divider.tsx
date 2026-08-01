import { View } from 'react-native';

import { cn } from '@/lib/utils';

type DividerProps = {
  className?: string;
};

// 品牌色横向分割线：登录/注册等表单标题下方的品牌绿色粗线。
function Divider({ className }: DividerProps) {
  return <View className={cn('h-[2px] w-full bg-[#7bf1a8]', className)} />;
}

export default Divider;
export { Divider };
