import {
  Text as ComposeText,
  DropdownMenu,
  DropdownMenuItem,
  Host,
  RNHostView,
} from '@expo/ui/jetpack-compose';
import { SymbolView } from 'expo-symbols';
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
};

const CHEVRON = {
  ios: 'chevron.down',
  android: 'arrow_drop_down',
  web: 'arrow_drop_down',
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
}: FilterDropdownProps) {
  const { colors } = useMaterialTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const content = (
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
          className="h-9 flex-row items-center gap-1 pl-3 pr-2"
        >
          {content}
        </Pressable>
        <ActionSheet
          visible={isSheetOpen}
          title={accessibilityLabel}
          options={options}
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
    <View className="h-9">
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
                className="h-9 flex-row items-center gap-1 pl-3 pr-2"
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
              </DropdownMenuItem>
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    </View>
  );
}
