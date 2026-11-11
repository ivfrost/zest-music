# Zest Music

A local-first music player for Android. It scans the folders you grant it, keeps the library in
SQLite, and plays the files through `react-native-audio-api` with background playback and a system
media notification.

I started Zest Music inspired by Vanilla Music. I wanted a more modern, native-feeling Android
interface and features I had missed, such as album-to-song filtering, tab-scoped search, and a
configurable response when tapping the currently playing song.

Audio files and the SQLite database stay on-device; no account is required. When an artist has
no MusicBrainz ID, artwork lookup sends its name to MusicBrainz to find one, then uses the ID with
Wikidata to find an image on Wikimedia Commons. If enabled, Deezer also receives the artist name
for fallback lookup.

## What works today

- Grant music folders through Android's SAF picker, then scan tags into SQLite
- Scanner recognizes AAC, AIFF, APE, ASF, CAF, DSD (DFF/DSF), FLAC, M4A/M4B, MP1/2/3, MP4,
  Musepack (MPC/MPP), Ogg-family (OGA/OGG/Opus/Speex), WAV, WMA and WavPack. Playback depends on
  Android native decoder support.
- Artists, Albums and Songs tabs, with Recent / Most played modes driven by persisted play counts
- Tapping an album anywhere filters the Songs tab behind a dismissible chip
- Artist page with an edge-to-edge hero image, album carousel and library counts
- Search overlay opened from a FAB, scoped to the entity of the current tab
- Full player: cover, play/pause, previous/next, shuffle, repeat one/all, seek bar with long-press
  fine scrubbing, and an up-next sheet
- Mini player that expands on drag; the search FAB sits above it
- Background playback with a media notification (play/pause, next/previous, scrubber)
- Settings: what tapping the current song does, artist image source, music folders
- Material 3 palette in light and dark, following the system setting

## Stack

- Expo SDK 58, React Native 0.88, React 19, TypeScript
- Expo Router with native bottom tabs
- NativeWind 4 for styling, `react-native-reanimated` 4 for gestures and transitions
- `expo-sqlite` with Drizzle ORM; migrations applied at boot
- `react-native-audio-api` for playback, a JSI module, so the app needs a dev build
- `music-metadata` and `strtok3` for tags, `zod` for persisted shapes
- Application id `io.github.ivfrost.zestmusic`

## Playback

Selecting a song passes its URI from the screen to `AudioProvider` and the singleton `audioEngine`.
For Android SAF `content://` URIs, the engine first copies the file into its app cache because the
native file source needs a local path. `StreamingAudio` then mounts the `Audio` component from
`react-native-audio-api` with that path and the shared `AudioContext`.

The signal path is:

```
SAF URI -> cached file -> native file source -> MediaElementSource
         -> BiquadFilterNode (gain 0 dB) -> AudioContext.destination -> device output
```

The native module decodes and plays the file. The filter is currently neutral, so it does not
change the sound; it is in the graph to support a future equalizer. Queue, shuffle order, repeat
mode and position persist so playback can be restored after a restart.

## Data

- Tables: `artists`, `releases`, `songs`, `playlists`. Songs carry duration, track number, play
  count and last played at.
- For better artist/release matching, tag files with MusicBrainz Picard before scanning. Zest Music
  reads embedded MusicBrainz IDs, falls back to tag names, and does not edit files. Missing values
  use `Unknown Artist` / `Unknown Album`.
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

- The Playlists tab is a stub; nothing writes to the playlist tables yet
- The song long-press menu lists actions that are not implemented yet
- The equalizer graph is wired but flat

## Roadmap

- Implement saved queues: “Play Now (preserve queue)” keeps the current queue for later
  restoration.
- Implement playlist management with deduplication on insert
- Floating lyrics window that can be dragged over the app
- Left-handed layout preference for one-handed reach
- Statistics export for pandas and matplotlib
- Cloud library locations
- Haptics for granular seek

## Licence

Apache-2.0. See [LICENSE](LICENSE).
