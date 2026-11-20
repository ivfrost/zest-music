import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { createPlaylist } from '@/db/library';
import { useLibraryDatabase } from '@/hooks/usePlaylists';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import { CenteredDialog } from './CenteredDialog';

type CreatePlaylistDialogProps = {
  visible: boolean;
  onClose: () => void;
  /** Called with the title that was created or matched. */
  onCreated: (title: string) => void;
};

export function CreatePlaylistDialog({
  visible,
  onClose,
  onCreated,
}: CreatePlaylistDialogProps) {
  const db = useLibraryDatabase();
  const { colors, rippleColor } = useMaterialTheme();
  const [name, setName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    setName('');
    setIsBusy(false);
    setError(null);
  }, [visible]);

  const create = async () => {
    const title = name.trim();
    if (!title || isBusy) return;

    setIsBusy(true);
    try {
      await createPlaylist(db, title);
      onCreated(title);
      onClose();
    } catch (cause) {
      console.warn('[Playlists] Could not create playlist', cause);
      setError('Could not create the playlist');
      setIsBusy(false);
    }
  };

  return (
    <CenteredDialog visible={visible} title="New playlist" onClose={onClose}>
      <View className="px-5 pb-5">
        <TextInput
          value={name}
          onChangeText={text => {
            setName(text);
            if (error) setError(null);
          }}
          placeholder="Playlist name"
          placeholderTextColor={colors.onSurfaceVariant}
          autoFocus
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={() => void create()}
          className="rounded-md3-sm bg-surface-container px-4 py-3 text-body-large"
          style={{ color: colors.onSurface }}
        />

        {error ? (
          <Text className="mt-2 text-body-medium text-on-surface-variant">
            {error}
          </Text>
        ) : null}

        <View className="mt-4 flex-row justify-end gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onClose}
            android_ripple={{ color: rippleColor, borderless: true }}
            className="rounded-md3-full px-4 py-2"
          >
            <Text className="text-label-large text-primary">Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create playlist"
            disabled={!name.trim() || isBusy}
            onPress={() => void create()}
            android_ripple={{ color: rippleColor, borderless: true }}
            className="rounded-md3-full px-4 py-2"
            style={{ opacity: !name.trim() || isBusy ? 0.5 : 1 }}
          >
            <Text className="text-label-large text-primary">Create</Text>
          </Pressable>
        </View>
      </View>
    </CenteredDialog>
  );
}
