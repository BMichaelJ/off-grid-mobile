import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { Detection } from '../../types/wildlife';
import { useThemedStyles } from '../../theme';
import { createStyles } from './styles';

interface BoundingBoxOverlayProps {
  detection: Detection;
  onPress: () => void;
}

const getBoxColor = (confidence: number): string => {
  if (confidence > 0.8) {
    return '#22C55E';
  }
  if (confidence > 0.5) {
    return '#EAB308';
  }
  return '#EF4444';
};

export const BoundingBoxOverlay: React.FC<BoundingBoxOverlayProps> = ({
  detection,
  onPress,
}) => {
  const styles = useThemedStyles(createStyles);
  const { boundingBox, species, speciesConfidence, id } = detection;
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
        <Text style={styles.boxConfidenceText}>
          {Math.round(speciesConfidence * 100)}%
        </Text>
      </View>
    </TouchableOpacity>
  );
};
