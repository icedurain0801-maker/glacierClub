import { Switch } from 'antd';
import type { SwitchProps } from 'antd';

interface NumberSwitchProps extends Omit<SwitchProps, 'value' | 'checked' | 'onChange'> {
  value?: number | boolean;
  onChange?: (v: number) => void;
  min?: number;
  max?: number;
}

export default function NumberSwitch({ value, onChange, min = 0, max = 1, ...rest }: NumberSwitchProps) {
  return (
    <Switch
      {...rest}
      checked={value === true || value === max}
      onChange={(checked) => onChange?.(checked ? max : min)}
    />
  );
}
