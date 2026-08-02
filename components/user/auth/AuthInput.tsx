import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';

// 登录/注册输入框预设：统一 auth 表单的输入框样式（黑色描边、大圆角、内容水平居中、小号字体，
// native/web 均生效）。基础 Input 原生端已是 text-sm，此处同步覆盖行高并去掉垂直内边距，
// 保证文本在固定高度里上下居中。
// key 绑定 placeholder：切换语言时文案变化，强制重建原生输入框，
// 规避 RN 在 Android 上动态修改 placeholder 导致提示词消失的 bug
function AuthInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      key={props.placeholder}
      {...props}
      className="native:py-0 native:leading-5 native:text-sm rounded-2xl border-black text-center text-sm"
    />
  );
}

export default AuthInput;
export { AuthInput };
