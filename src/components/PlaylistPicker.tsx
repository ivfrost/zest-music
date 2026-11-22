import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { addSongToPlaylist, createPlaylist } from '@/db/library';
import {
  type PlaylistSummary,
  useLibraryDatabase,
  usePlaylists,
} from '@/hooks/usePlaylists';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import { CenteredDialog } from './CenteredDialog';

type PlaylistPickerProps = {
  visible: boolean;
  songId: string | null;
  onClose: () => void;
  /** Called with the transient message to show once the dialog is done. */
  onResult: (message: string) => void;
};

const songLabel = (count: number) =>
  count === 1 ? '1 song' : `${count} songs`;

/** Centered picker for adding one song to a playlist, creating one if needed. */
export function PlaylistPicker({
  visible,
  songId,
  onClose,
  onResult,
}: PlaylistPickerProps) {
  const db = useLibraryDatabase();
  const playlists = usePlaylists();
  const { colors, rippleColor } = useMaterialTheme();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [name, setName] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;

    setMode('list');
    setName('');
    setIsBusy(false);
  }, [visible]);

  const finish = (message: string) => {
    onResult(message);
    onClose();
  };

  const addTo = async (playlist: PlaylistSummary) => {
    if (!songId || isBusy) return;

    setIsBusy(true);
    try {
      const added = await addSongToPlaylist(db, songId, playlist.id);
      finish(
        added
          ? `Added to ${playlist.title}`
          : `Already in ${playlist.title}`,
      );
    } catch (error) {
      console.warn('[Playlists] Could not add song', error);
      finish('Could not add to playlist');
    }
  };

  const createAndAdd = async () => {
    const title = name.trim();
    if (!songId || !title || isBusy) return;

    setIsBusy(true);
    try {
      const playlistId = await createPlaylist(db, title);
      const added = await addSongToPlaylist(db, songId, playlistId);
      finish(added ? `Added to ${title}` : `Already in ${title}`);
    } catch (error) {
      console.warn('[Playlists] Could not create playlist', error);
      finish('Could not create playlist');
    }
  };

  return (
    <CenteredDialog
      visible={visible}
      title={mode === 'create' ? 'New playlist' : 'Add to playlist'}
      onClose={onClose}
    >
      {mode === 'create' ? (
        <View className="px-5 pb-5">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            placeholderTextColor={colors.onSurfaceVariant}
            autoFocus
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => void createAndAdd()}
            className="rounded-md3-sm bg-surface-container px-4 py-3 text-body-large"
            style={{ color: colors.onSurface }}
          />

          <View className="mt-4 flex-row justify-end gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to playlists"
              onPress={() => setMode('list')}
              android_ripple={{ color: rippleColor, borderless: true }}
              className="rounded-md3-full px-4 py-2"
            >
              <Text className="text-label-large text-primary">Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create playlist"
              disabled={!name.trim() || isBusy}
              onPress={() => void createAndAdd()}
              android_ripple={{ color: rippleColor, borderless: true }}
              className="rounded-md3-full px-4 py-2"
              style={{ opacity: !name.trim() || isBusy ? 0.5 : 1 }}
            >
              <Text className="text-label-large text-primary">Create</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <ScrollView
          style={{ flexGrow: 0, flexShrink: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {playlists.length === 0 ? (
            <Text className="px-5 pb-2 text-body-medium text-on-surface-variant">
              No playlists yet
            </Text>
          ) : (
            playlists.map(playlist => (
              <Pressable
                key={playlist.id}
                accessibilityRole="button"
                accessibilityLabel={`${playlist.title}, ${songLabel(playlist.songCount)}`}
                disabled={isBusy || !songId}
                onPress={() => void addTo(playlist)}
                android_ripple={{ color: rippleColor }}
                className="px-5 py-3"
              >
                <Text
                  numberOfLines={1}
                  className="text-body-large text-on-surface"
                >
                  {playlist.title}
                </Text>
                <Text className="mt-0.5 text-body-medium text-on-surface-variant opacity-70">
                  {songLabel(playlist.songCount)}
                </Text>
              </Pressable>
            ))
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New playlist"
            disabled={isBusy}
            onPress={() => setMode('create')}
            android_ripple={{ color: rippleColor }}
            className="mt-1 px-5 py-4"
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.outlineVariant,
            }}
          >
            <Text className="text-body-large text-primary">New playlist…</Text>
          </Pressable>
        </ScrollView>
      )}
    </CenteredDialog>
  );
}
