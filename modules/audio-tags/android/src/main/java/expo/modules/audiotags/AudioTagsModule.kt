package expo.modules.audiotags

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import org.jaudiotagger.audio.AudioFileIO
import org.jaudiotagger.tag.FieldKey
import org.jaudiotagger.tag.Tag
import org.jaudiotagger.tag.TagTextField
import java.io.File
import java.security.MessageDigest
import java.util.Locale
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Tag keys MusicBrainz Picard writes, per container: Vorbis comments (FLAC, Ogg),
 * MP4 freeform atoms and ID3v2 TXXX frames.
 */
private val ALBUM_ID_KEYS = listOf(
    "MUSICBRAINZ_ALBUMID",
    "----:com.apple.iTunes:MusicBrainz Album Id",
    "TXXX:MusicBrainz Album Id",
)
private val RELEASE_GROUP_ID_KEYS = listOf(
    "MUSICBRAINZ_RELEASEGROUPID",
    "----:com.apple.iTunes:MusicBrainz Release Group Id",
    "TXXX:MusicBrainz Release Group Id",
)
private val RECORDING_ID_KEYS = listOf(
    "MUSICBRAINZ_TRACKID",
    "----:com.apple.iTunes:MusicBrainz Track Id",
    "TXXX:MusicBrainz Track Id",
    "UFID:http://musicbrainz.org",
)
private val RELEASE_TRACK_ID_KEYS = listOf(
    "MUSICBRAINZ_RELEASETRACKID",
    "----:com.apple.iTunes:MusicBrainz Release Track Id",
    "TXXX:MusicBrainz Release Track Id",
)
private val ARTIST_ID_KEYS = listOf(
    "MUSICBRAINZ_ARTISTID",
    "----:com.apple.iTunes:MusicBrainz Artist Id",
    "TXXX:MusicBrainz Artist Id",
)
private val ALBUM_ARTIST_ID_KEYS = listOf(
    "MUSICBRAINZ_ALBUMARTISTID",
    "----:com.apple.iTunes:MusicBrainz Album Artist Id",
    "TXXX:MusicBrainz Album Artist Id",
)
private val RELEASE_TYPE_KEYS = listOf(
    "RELEASETYPE",
    "MUSICBRAINZ_ALBUMTYPE",
    "----:com.apple.iTunes:MusicBrainz Album Type",
    "TXXX:MusicBrainz Album Type",
)
private val COVER_EXTENSIONS = mapOf(
    "image/jpeg" to ".jpg",
    "image/jpg" to ".jpg",
    "image/png" to ".png",
    "image/webp" to ".webp",
    "image/gif" to ".gif",
    "image/bmp" to ".bmp",
)

class AudioTagsResult : Record {
    @Field
    var title = ""

    @Field
    var album = ""

    @Field
    var artists: List<String> = emptyList()

    @Field
    var albumArtists: List<String> = emptyList()

    @Field
    var trackNumber = 0

    @Field
    var durationSeconds = 0.0

    @Field
    var releaseType: List<String> = emptyList()

    @Field
    var musicBrainzAlbumId = ""

    @Field
    var musicBrainzReleaseGroupId = ""

    @Field
    var musicBrainzRecordingId = ""

    @Field
    var musicBrainzTrackId = ""

    @Field
    var musicBrainzArtistIds: List<String> = emptyList()

    @Field
    var musicBrainzAlbumArtistIds: List<String> = emptyList()

    @Field
    var artworkUri = ""
}

/**
 * Reads embedded tags natively, so indexing does not cross the JS bridge for each
 * tag.
 *
 * The module opens the URI as a descriptor and parses `/proc/self/fd/<fd>`. That
 * path is a real file, so the parser can seek it and no copy of the audio file is
 * made. Embedded artwork goes to `files/covers/<sha256>`, the same directory and
 * key the JS writer uses. Covers therefore keep one file per image.
 */
class AudioTagsModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("AudioTags")

        // jaudiotagger logs every metadata block at INFO, which is noise for each file.
        OnCreate {
            Logger.getLogger("org.jaudiotagger").level = Level.OFF
        }

        AsyncFunction("read") { uriString: String ->
            val context = appContext.reactContext
                ?: throw IllegalStateException("React context is not available")

            val uri = Uri.parse(uriString)
            val extension = uri.lastPathSegment
                ?.substringAfterLast('.', "")
                ?.lowercase(Locale.US)
                .orEmpty()

            val descriptor = context.contentResolver.openFileDescriptor(uri, "r")
                ?: throw IllegalStateException("Provider returned no descriptor")

            try {
                val audioFile = AudioFileIO.readAs(
                    File("/proc/self/fd/${descriptor.fd}"),
                    extension,
                )
                val tag = audioFile.tag
                val header = audioFile.audioHeader

                AudioTagsResult().apply {
                    title = first(tag, FieldKey.TITLE).orEmpty()
                    album = first(tag, FieldKey.ALBUM).orEmpty()
                    artists = all(tag, FieldKey.ARTIST)
                    albumArtists = all(tag, FieldKey.ALBUM_ARTIST)
                    trackNumber = trackNumber(tag)
                    durationSeconds = header?.preciseTrackLength ?: 0.0
                    releaseType = allMatching(tag, RELEASE_TYPE_KEYS)
                    musicBrainzAlbumId = firstMatching(tag, ALBUM_ID_KEYS)
                    musicBrainzReleaseGroupId = firstMatching(tag, RELEASE_GROUP_ID_KEYS)
                    musicBrainzRecordingId = firstMatching(tag, RECORDING_ID_KEYS)
                    musicBrainzTrackId = firstMatching(tag, RELEASE_TRACK_ID_KEYS)
                    musicBrainzArtistIds = allMatching(tag, ARTIST_ID_KEYS)
                    musicBrainzAlbumArtistIds = allMatching(tag, ALBUM_ARTIST_ID_KEYS)
                    artworkUri = storeArtwork(tag, context.filesDir)
                }
            } finally {
                descriptor.close()
            }
        }
    }

    private fun first(tag: Tag?, key: FieldKey): String? =
        tag?.let { runCatching { it.getFirst(key) }.getOrNull() }
            ?.trim()
            ?.ifEmpty { null }

    private fun all(tag: Tag?, key: FieldKey): List<String> =
        tag?.let { runCatching { it.getAll(key) }.getOrNull() }
            .orEmpty()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .distinct()

    private fun firstMatching(tag: Tag?, keys: List<String>): String =
        keys.firstNotNullOfOrNull { key ->
            tag?.let { runCatching { it.getFirst(key) }.getOrNull() }
                ?.trim()
                ?.ifEmpty { null }
        }.orEmpty()

    private fun allMatching(tag: Tag?, keys: List<String>): List<String> =
        keys.flatMap { key ->
            tag?.let { runCatching { it.getFields(key) }.getOrNull() }
                .orEmpty()
                .map { field ->
                    ((field as? TagTextField)?.content ?: field.toString()).trim()
                }
                .filter { it.isNotEmpty() }
        }.distinct()

    private fun trackNumber(tag: Tag?): Int {
        val raw = first(tag, FieldKey.TRACK) ?: return 0
        return raw.substringBefore('/').trim().toIntOrNull() ?: 0
    }

    private fun storeArtwork(tag: Tag?, filesDir: File?): String {
        if (tag == null) return ""
        val artwork = runCatching { tag.firstArtwork }.getOrNull() ?: return ""
        val data = runCatching { artwork.binaryData }.getOrNull() ?: return ""
        if (data.isEmpty()) return ""

        val digest = MessageDigest.getInstance("SHA-256").digest(data)
        val hash = digest.joinToString("") { String.format(Locale.US, "%02x", it) }
        val extension = COVER_EXTENSIONS[artwork.mimeType?.lowercase(Locale.US)] ?: ".img"

        val directory = File(filesDir, "covers")
        if (!directory.isDirectory) directory.mkdirs()
        val file = File(directory, "$hash$extension")
        if (!file.exists()) file.writeBytes(data)

        return "file://${file.absolutePath}"
    }
}
