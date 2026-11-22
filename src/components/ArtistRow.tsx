import type { ComponentProps } from 'react';
import { Row } from './Row';

type ArtistRowProps = {
  name: string;
  subtitle?: string;
  artworkUri?: string | null;
  onPress: () => void;
  iconColor: string;
  rippleColor: string;
  onLayout?: ComponentProps<typeof Row>['onLayout'];
};

export function ArtistRow({
  name,
  subtitle,
  artworkUri,
  onPress,
  iconColor,
  rippleColor,
  onLayout,
}: ArtistRowProps) {
  return (
    <Row
      title={name}
      subtitle={subtitle}
      artworkUri={artworkUri}
      icon={{ ios: 'music.mic', android: 'person', web: 'person' }}
      onPress={onPress}
      iconColor={iconColor}
      rippleColor={rippleColor}
      showChevron
      onLayout={onLayout}
    />
  );
}
