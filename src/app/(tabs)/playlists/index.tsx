import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { ActionSheet } from '@/components/ActionSheet';
import { CreatePlaylistDialog } from '@/components/CreatePlaylistDialog';
import { Row } from '@/components/Row';
import { useRowSeparator } from '@/components/RowSeparator';
import { Snackbar, type SnackbarMessage } from '@/components/Snackbar';
import { TabMenuButton } from '@/components/TabMenuButton';
import { TabScreen } from '@/components/TabScreen';
import { deletePlaylist } from '@/db/library';
import { useMaterialTheme } from '@/hooks/useMaterialTheme';
import {
  type PlaylistSummary,
  useLibraryDatabase,
  usePlaylists,
} from '@/hooks/usePlaylists';
import { spacing } from '@/theme';

const PLUS_ICON = {
  ios: 'plus',
  android: 'add',
  web: 'add',
} as const;

const QUEUE_ICON = {
  ios: 'music.note.list',
  android: 'queue_music',
  web: 'queue_music',
} as const;

const songLabel = (count: number) =>
  count === 1 ? '1 song' : `${count} songs`;

export default function PlaylistTab() {
  const db = useLibraryDatabase();
  const playlists = usePlaylists();
  const { colors, rippleColor, dividerColor } = useMaterialTheme();
  const renderSeparator = useRowSeparator(dividerColor, 88);
  const [isCreating, setIsCreating] = useState(false);
  const [actionPlaylist, setActionPlaylist] =
    useState<PlaylistSummary | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarMessage | null>(null);

  const openPlaylist = (playlistId: string) => {
    // The dev server regenerates the typed-routes file. The cast keeps
    // tsc green until then.
    router.push({
      pathname: '/playlists/[id]',
      params: { id: playlistId },
    } as never);
  };

  const confirmDelete = (playlist: PlaylistSummary) => {
    Alert.alert(
      'Delete playlist?',
      `“${playlist.title}” will be removed. Its songs stay in your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const deleted = await deletePlaylist(db, playlist.id);
                setSnackbar({
                  id: Date.now(),
                  text: deleted
                    ? `Deleted ${playlist.title}`
                    : 'Playlist not found',
                });
              } catch (error) {
                console.warn('[Playlists] Could not delete playlist', error);
                setSnackbar({
                  id: Date.now(),
                  text: 'Could not delete playlist',
                });
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <TabScreen>
      <View className="flex-row items-center justify-between">
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="text-title-large font-medium text-on-surface"
        >
          Playlists
        </Text>
        <View className="flex-row items-center">
          <View className="h-12 w-12 overflow-hidden rounded-md3-full">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New playlist"
              onPress={() => setIsCreating(true)}
              android_ripple={{ color: rippleColor, borderless: true }}
              className="h-full w-full items-center justify-center"
            >
              <SymbolView
                name={PLUS_ICON}
                size={24}
                tintColor={colors.onSurface}
              />
            </Pressable>
          </View>
          <TabMenuButton />
        </View>
      </View>

      <FlatList
        data={playlists}
        keyExtractor={playlist => playlist.id}
        ItemSeparatorComponent={renderSeparator}
        contentContainerStyle={{ paddingTop: spacing.md }}
        ListEmptyComponent={
          <View className="px-4 pt-2">
            <Text className="text-body-large text-on-surface-variant">
              No playlists yet
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create playlist"
              onPress={() => setIsCreating(true)}
              className="mt-2 self-start"
            >
              <Text className="text-label-large text-primary">
                Create playlist
              </Text>
            </Pressable>
          </View>
        }
        renderItem={({ item: playlist }) => (
          <Row
            title={playlist.title}
            subtitle={songLabel(playlist.songCount)}
            icon={QUEUE_ICON}
            iconColor={colors.onSurfaceVariant}
            rippleColor={rippleColor}
            onPress={() => openPlaylist(playlist.id)}
            onLongPress={() => setActionPlaylist(playlist)}
            showChevron
          />
        )}
      />

      <ActionSheet
        visible={actionPlaylist !== null}
        title={actionPlaylist?.title}
        message={
          actionPlaylist ? songLabel(actionPlaylist.songCount) : undefined
        }
        options={['Delete playlist']}
        onSelect={() => {
          const playlist = actionPlaylist;
          setActionPlaylist(null);
          if (playlist) confirmDelete(playlist);
        }}
        onCancel={() => setActionPlaylist(null)}
      />

      <CreatePlaylistDialog
        visible={isCreating}
        onClose={() => setIsCreating(false)}
        onCreated={title =>
          setSnackbar({ id: Date.now(), text: `Created ${title}` })
        }
      />
      <Snackbar message={snackbar} onDismiss={() => setSnackbar(null)} />
    </TabScreen>
  );
}
