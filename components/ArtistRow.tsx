import { Row } from './Row';

type ArtistRowProps = {
  name: string;
  subtitle?: string;
  artworkUri?: string | null;
  onPress: () => void;
  iconColor: string;
  rippleColor: string;
};

export function ArtistRow({
  name,
  subtitle,
  artworkUri,
  onPress,
  iconColor,
  rippleColor,
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
    />
  );
}
