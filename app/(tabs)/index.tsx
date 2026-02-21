import { useState } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

interface ProvisioningResult {
  success: boolean;
  ssid?: string;
  ip?: string;
  deviceName?: string;
  deviceId?: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const [lastResult, setLastResult] = useState<ProvisioningResult | null>(null);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          ESP WiFi Provisioning
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Test app for esp-wifi-manager-react-native
        </ThemedText>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/provision')}
        >
          <ThemedText style={styles.buttonText}>
            Start WiFi Provisioning
          </ThemedText>
        </TouchableOpacity>

        {lastResult && (
          <ThemedView style={styles.resultContainer}>
            <ThemedText type="subtitle">Last Result</ThemedText>
            <ThemedText>
              Status: {lastResult.success ? 'Success' : 'Failed'}
            </ThemedText>
            {lastResult.ssid && (
              <ThemedText>SSID: {lastResult.ssid}</ThemedText>
            )}
            {lastResult.ip && (
              <ThemedText>IP: {lastResult.ip}</ThemedText>
            )}
            {lastResult.deviceName && (
              <ThemedText>Device: {lastResult.deviceName}</ThemedText>
            )}
          </ThemedView>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  resultContainer: {
    marginTop: 32,
    padding: 16,
    borderRadius: 12,
    gap: 8,
    width: '100%',
  },
});
