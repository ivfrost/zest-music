import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Text, View } from 'react-native';
import { SEPARATOR_HEIGHT, useWholeRowList } from '@/hooks/useWholeRowList';

type ListCardLayout = {
  listMaxHeight: number | undefined;
  onRowLayout: (event: LayoutChangeEvent) => void;
};

type ListCardProps = {
  titleRow: ReactNode;
  label: string;
  actions?: ReactNode;
  showHeader?: boolean;
  children: (layout: ListCardLayout) => ReactNode;
};

export function ListCard({
  titleRow,
  label,
  actions,
  showHeader = true,
  children,
}: ListCardProps) {
  const {
    listMaxHeight,
    onPageLayout,
    onCardLayout,
    onHeaderLayout,
    onRowLayout,
  } = useWholeRowList(showHeader);

  return (
    <View className="flex-1" onLayout={onPageLayout}>
      {titleRow}
      <View
        className="mt-3 max-h-full shrink overflow-hidden rounded-md3-xl bg-surface-container-low"
        onLayout={onCardLayout}
      >
        {showHeader && (
          <View
            className="flex-row items-center py-1 pl-5 pr-3"
            onLayout={onHeaderLayout}
          >
            <Text
              numberOfLines={1}
              className="flex-1 text-body-medium text-on-surface-variant"
            >
              {label}
            </Text>
            {actions}
          </View>
        )}
        {children({ listMaxHeight, onRowLayout })}
        {/* Covers the separator at the viewport edge; sits over row padding only. */}
        <View
          pointerEvents="none"
          className="absolute inset-x-0 bottom-0 bg-surface-container-low"
          style={{ height: SEPARATOR_HEIGHT + 1 }}
        />
      </View>
    </View>
  );
}
