import React from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';

export default function App(): React.JSX.Element {
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.card}>
        <Text style={styles.eyebrow}>SAPKALABS</Text>
        <Text style={styles.title}>Assetloom</Text>
        <Text style={styles.copy}>
          Native Android and iOS resources generated before compilation.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: '#172033',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#222d44',
    borderColor: '#3f4d6a',
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 440,
    padding: 32,
    width: '100%',
  },
  copy: {
    color: '#b7c2da',
    fontSize: 17,
    lineHeight: 25,
  },
  eyebrow: {
    color: '#69e0ba',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '800',
    marginBottom: 16,
  },
});
