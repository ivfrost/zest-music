package expo.modules.saffiledescriptor

import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Opens SAF `content://` URIs as file descriptors and exposes them as
 * `/proc/self/fd/<fd>` paths.
 *
 * The audio engine accepts filesystem paths only. A `/proc/self/fd` path is a
 * real path to the already-open file, so playback can read it in place instead
 * of copying the whole track into the app cache first.
 *
 * A descriptor must stay open while the track plays; `close` releases it.
 */
class SafFileDescriptorModule : Module() {
  private val handles = mutableMapOf<Int, ParcelFileDescriptor>()
  private var nextHandle = 1

  override fun definition() = ModuleDefinition {
    Name("SafFileDescriptor")

    AsyncFunction("open") { uriString: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")

      val uri = Uri.parse(uriString)
      val descriptor = context.contentResolver.openFileDescriptor(uri, "r")
        ?: throw IllegalStateException("Provider returned no descriptor")

      val handle = nextHandle++
      handles[handle] = descriptor

      mapOf(
        "handle" to handle,
        "path" to "/proc/self/fd/${descriptor.fd}",
        "size" to descriptor.statSize,
      )
    }

    AsyncFunction("close") { handle: Int ->
      handles.remove(handle)?.close()
      Unit
    }

    Function("closeAll") {
      handles.values.forEach { descriptor ->
        runCatching { descriptor.close() }
      }
      handles.clear()
    }

    OnDestroy {
      handles.values.forEach { descriptor ->
        runCatching { descriptor.close() }
      }
      handles.clear()
    }
  }
}
