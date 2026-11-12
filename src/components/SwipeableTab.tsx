import { router, usePathname, type Href } from 'expo-router';
import { type PropsWithChildren, useMemo, useRef } from 'react';
import { PanResponder, View } from 'react-native';

const TAB_ROUTES: Href[] = [
  '/artists',
  '/songs',
  '/albums',
  '/playlists',
  '/tests',
];
const MIN_HORIZONTAL_DISTANCE = 16;
const SWIPE_THRESHOLD = 60;

export function SwipeableTab({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const panResponder = useMemo(() => {
    const isHorizontalSwipe = (
      _event: unknown,
      gesture: { dx: number; dy: number },
    ) =>
      Math.abs(gesture.dx) > MIN_HORIZONTAL_DISTANCE &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: isHorizontalSwipe,
      onMoveShouldSetPanResponderCapture: isHorizontalSwipe,
      onPanResponderRelease: (_, gesture) => {
        const currentIndex = TAB_ROUTES.indexOf(pathnameRef.current as Href);
        if (currentIndex === -1) return;

        if (gesture.dx <= -SWIPE_THRESHOLD) {
          const next = TAB_ROUTES[currentIndex + 1];
          if (next) router.navigate(next);
        } else if (gesture.dx >= SWIPE_THRESHOLD) {
          const previous = TAB_ROUTES[currentIndex - 1];
          if (previous) router.navigate(previous);
        }
      },
    });
  }, []);

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}
