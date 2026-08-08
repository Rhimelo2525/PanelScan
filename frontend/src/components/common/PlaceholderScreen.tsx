import { StyleSheet, Text, View } from 'react-native';

interface PlaceholderScreenProps {
  title: string;
  description?: string;
}

/**
 * Minimal placeholder used by every screen in src/screens/ during this scaffolding
 * phase. Replace with real UI as each screen is actually built — this component's
 * only job is to make every screen file a valid, renderable component in the
 * meantime, not to be a design system.
 */
export const PlaceholderScreen = ({ title, description }: PlaceholderScreenProps) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>
    {description ? <Text style={styles.description}>{description}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    marginTop: 8,
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
});
