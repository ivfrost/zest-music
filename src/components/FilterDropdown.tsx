import {
  Text as ComposeText,
  DropdownMenu,
  DropdownMenuItem,
  Host,
  RNHostView,
} from '@expo/ui/jetpack-compose';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import { ActionSheet } from './ActionSheet';

type FilterDropdownProps = {
  label: string;
  options: readonly string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  accessibilityLabel: string;
  /** Replaces the label with a compact 48dp icon trigger. */
  icon?: SymbolViewProps['name'];
  iconColor?: string;
  itemChevron?: boolean;
};

const CHEVRON = {
  ios: 'chevron.down',
  android: 'arrow_drop_down',
  web: 'arrow_drop_down',
} as const;

export const FILTER_ICON = {
  ios: 'line.3.horizontal.decrease',
  android: 'filter_list',
  web: 'filter_list',
} as const;

export const SORT_ICON = {
  ios: 'arrow.up.arrow.down',
  android: 'sort_by_alpha',
  web: 'sort_by_alpha',
} as const;

const pressedStyle = ({ pressed }: { pressed: boolean }) =>
  pressed ? { opacity: 0.7 } : undefined;

/** Flat trigger that folds a small set of choices into one menu. */
export function FilterDropdown({
  label,
  options,
  selectedIndex,
  onSelect,
  accessibilityLabel,
  icon,
  iconColor,
  itemChevron,
}: FilterDropdownProps) {
  const { colors, rippleColor } = useMaterialTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const triggerClass = icon
    ? 'h-12 w-12 items-center justify-center'
    : 'h-9 flex-row items-center gap-1 pl-3 pr-2';

  const content = icon ? (
    <SymbolView
      name={icon}
      size={24}
      tintColor={iconColor ?? colors.onSurfaceVariant}
    />
  ) : (
    <>
      <Text
        numberOfLines={1}
        className="text-label-large font-medium text-on-surface"
      >
        {label}
      </Text>
      <SymbolView
        name={CHEVRON}
        size={18}
        tintColor={colors.onSurfaceVariant}
      />
    </>
  );

  if (Platform.OS !== 'android') {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={() => setIsSheetOpen(true)}
          style={pressedStyle}
          android_ripple={{ color: rippleColor, borderless: true }}
          className={triggerClass}
        >
          {content}
        </Pressable>
        <ActionSheet
          visible={isSheetOpen}
          title={accessibilityLabel}
          options={options}
          itemChevron={itemChevron}
          onSelect={index => {
            setIsSheetOpen(false);
            onSelect(index);
          }}
          onCancel={() => setIsSheetOpen(false)}
        />
      </>
    );
  }

  return (
    <View className={icon ? 'h-12 w-12' : 'h-9'}>
      <Host matchContents>
        <DropdownMenu
          expanded={isExpanded}
          onDismissRequest={() => setIsExpanded(false)}
        >
          <DropdownMenu.Trigger>
            <RNHostView matchContents>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                onPress={() => setIsExpanded(true)}
                style={pressedStyle}
                android_ripple={{ color: rippleColor, borderless: true }}
                className={triggerClass}
              >
                {content}
              </Pressable>
            </RNHostView>
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            {options.map((option, index) => (
              <DropdownMenuItem
                key={option}
                onClick={() => {
                  setIsExpanded(false);
                  if (index !== selectedIndex) onSelect(index);
                }}
              >
                <DropdownMenuItem.Text>
                  <ComposeText>{option}</ComposeText>
                </DropdownMenuItem.Text>
                {itemChevron ? (
                  <DropdownMenuItem.TrailingIcon>
                    <RNHostView matchContents>
                      <SymbolView
                        name={{
                          ios: 'chevron.right',
                          android: 'chevron_right',
                          web: 'chevron_right',
                        }}
                        size={20}
                        tintColor={colors.onSurfaceVariant}
                      />
                    </RNHostView>
                  </DropdownMenuItem.TrailingIcon>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    </View>
  );
}
