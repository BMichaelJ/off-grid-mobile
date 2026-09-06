import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { Detection } from '../../types/wildlife';
import { useThemedStyles, useTheme } from '../../theme';
import { createStyles } from './styles';

interface BoundingBoxOverlayProps {
  detection: Detection;
  onPress: () => void;
}

export const BoundingBoxOverlay: React.FC<BoundingBoxOverlayProps> = ({
  detection,
  onPress,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { boundingBox, species, speciesConfidence, id } = detection;

  const getBoxColor = (confidence: number): string => {
    if (confidence > 0.8) return colors.statusSuccess;
    if (confidence > 0.5) return colors.statusWarning;
    return colors.statusError;
  };
  const borderColor = getBoxColor(speciesConfidence);

  return (
    <TouchableOpacity
      testID={`bounding-box-${id}`}
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.boundingBox,
        {
          left: `${boundingBox.x * 100}%`,
          top: `${boundingBox.y * 100}%`,
          width: `${boundingBox.width * 100}%`,
          height: `${boundingBox.height * 100}%`,
          borderColor,
        },
      ]}
    >
      <View style={[styles.boxLabel, { backgroundColor: borderColor }]}>
        <Text style={styles.boxLabelText}>{species}</Text>
      </View>
    </TouchableOpacity>
  );
};
