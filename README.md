# Zest Music

A local-first music player for Android. It scans the folders you grant it, keeps the library in
SQLite, and plays the files through `react-native-audio-api` with background playback and a system
media notification.

Built as a daily driver for a personal FLAC/MP3 collection rather than a streaming client: files stay
on the device, there is no account, and nothing is uploaded.

## What works today

- Grant music folders through Android's SAF picker, then scan tags into SQLite
- Artists, Albums and Songs tabs, with Recent / Most played modes driven by persisted play counts
- Tapping an album anywhere filters the Songs tab behind a dismissible chip
- Artist page with an edge-to-edge hero image, album carousel and library counts
- Search overlay opened from a FAB, scoped to the entity of the current tab
- Full player: cover, play/pause, previous/next, shuffle, repeat one/all, seek bar with long-press
  fine scrubbing, and an up-next sheet
- Mini player that expands on drag, with the search FAB clearing it
- Background playback with a media notification (play/pause, next/previous, scrubber)
- Settings: what tapping the current song does, artist image source, music folders
- Material 3 tonal surfaces in light and dark

## Stack

- Expo SDK 58, React Native 0.88, React 19, TypeScript
- Expo Router with native bottom tabs
- NativeWind 4 for styling, `react-native-reanimated` 4 for gestures and transitions
- `expo-sqlite` with Drizzle ORM; migrations applied at boot
- `react-native-audio-api` for playback, a JSI module, so the app needs a dev build
- `music-metadata` and `strtok3` for tags, `zod` for persisted shapes

## Playback engine

A single `AudioContext` lives in an engine singleton, exposed to React through
`useSyncExternalStore`; the provider only renders `<Audio>` for the current source. The graph is
wired once and reused:

```
file source -> createMediaElementSource -> biquad EQ -> destination
```

- SAF `content://` URIs cannot be opened by the native file source, so each file is copied once into
  a cache directory under a hashed name with a safe extension, then streamed from disk. The cache has
  a byte budget, a TTL and LRU eviction.
- The EQ node is flat (`gain = 0`). It exists as the seam for a future equalizer, not a feature yet.
- Queue, shuffle order, repeat mode and position persist to storage, so a cold start restores the
  session where it stopped.
- `loadId` guards against a slow copy resolving after a newer track was requested.

## Data

- Tables: `artists`, `releases`, `songs`, `playlists`. Songs carry duration, track number, play count
  and last played at; playlists exist in the schema only.
- Files are matched to releases and artists by MusicBrainz ids, then by tag names, with
  `Unknown Artist` / `Unknown Album` fallbacks so nothing is dropped from the library.
- Play statistics are written once per actual playback and read through a small module store, so the
  UI never waits on the database for ranking.

## Structure

| Path | Contents |
| --- | --- |
| `app/` | Expo Router routes: tabs, artist detail, settings |
| `components/` | list rows, search overlay, action sheet, mini and full player |
| `audio/` | engine, provider, queue and session persistence, cache, notification sync |
| `context/` | library scanning and tab bar state |
| `db/` | Drizzle schema, select schemas, generated migrations |
| `hooks/` | theme, preferences, artist images, audio and library accessors |
| `lib/` | stateless helpers: stats, album filter, artist images, formatting, storage |
| `types/` | zod schemas and shared types |

## Run locally

Requires Node and a dev build; Expo Go will not run this app.

```bash
npm install
npx expo run:android
npx expo start -c    # after adding routes or changing tailwind classes
```

## Known gaps

- The Playlists tab is a stub and nothing writes to the playlist tables
- The song long-press menu lists actions that are not implemented yet
- The equalizer graph is wired but flat
- No lyrics, no cloud sources, no export

## Roadmap

- Saved queues: park the current queue, play something else, restore the previous one
  ("check this out")
- Playlists with deduplication on insert
- Floating lyrics window that can be dragged over the app
- Left-handed layout preference for one-handed reach
- Statistics export for pandas and matplotlib
- Cloud library locations
- Haptics for granular seek
- A multitool FAB consolidating search and common actions

## Licence

Apache-2.0. See [LICENSE](LICENSE).
