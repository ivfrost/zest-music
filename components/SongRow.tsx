import { Text } from 'react-native';
import { formatDuration } from '@/lib/format';
import { Row } from './Row';

type SongRowProps = {
  title: string;
  subtitle: string;
  artworkUri: string | null;
  onPress: () => void;
  onLongPress?: () => void;
  iconColor: string;
  rippleColor: string;
  durationSeconds?: number | null;
};

export function SongRow({ durationSeconds, ...props }: SongRowProps) {
  return (
    <Row
      {...props}
      trailing={
        durationSeconds != null ? (
          <Text className="ml-3 text-sm text-on-surface-variant opacity-70">
            {formatDuration(durationSeconds)}
          </Text>
        ) : undefined
      }
      icon={{ ios: 'music.note', android: 'music_note', web: 'music_note' }}
    />
  );
}
