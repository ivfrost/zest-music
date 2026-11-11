import { useCallback } from 'react';
import { View } from 'react-native';

interface RowSeparatorProps {
  dividerColor?: string;
  insetStart?: number;
}

export default function RowSeparator({
  dividerColor,
  insetStart = 0,
}: RowSeparatorProps) {
  return (
    <View
      className="self-stretch"
      style={{
        height: 1,
        marginLeft: insetStart,
        backgroundColor: dividerColor,
      }}
    />
  );
}

export function useRowSeparator(dividerColor?: string, insetStart = 0) {
  return useCallback(
    () => <RowSeparator dividerColor={dividerColor} insetStart={insetStart} />,
    [dividerColor, insetStart],
  );
}
