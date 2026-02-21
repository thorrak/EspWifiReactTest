import { useEffect, useState, Component, type ReactNode } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { BleManager, State } from 'react-native-ble-plx';
import { ProvisioningNavigator } from 'esp-wifi-manager-react-native/navigation';

const BLE_STATE_MESSAGES: Partial<Record<State, string>> = {
  [State.Unsupported]: 'This device does not support Bluetooth Low Energy.',
  [State.Unauthorized]:
    'Bluetooth permission has not been granted. Please enable it in Settings.',
  [State.PoweredOff]:
    'Bluetooth is turned off. Please enable Bluetooth to continue.',
};

// ---------------------------------------------------------------------------
// Error Boundary — catches unexpected runtime errors from ProvisioningNavigator
// ---------------------------------------------------------------------------
interface ErrorBoundaryProps {
  onDismiss: () => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ProvisioningErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <BleUnavailableScreen
          message={`An unexpected error occurred:\n${this.state.error.message}`}
          onDismiss={this.props.onDismiss}
        />
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// BLE Unavailable Screen
// ---------------------------------------------------------------------------
function BleUnavailableScreen({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.unavailable}>
      <Text style={styles.unavailableIcon}>&#x26A0;</Text>
      <Text style={styles.unavailableTitle}>Bluetooth Unavailable</Text>
      <Text style={styles.unavailableMessage}>{message}</Text>
      <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
        <Text style={styles.dismissButtonText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function ProvisionScreen() {
  const router = useRouter();
  const [bleState, setBleState] = useState<State>(State.Unknown);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Create a temporary BleManager just to check state, then destroy it
    // so it doesn't conflict with the library's internal BleManager.
    const manager = new BleManager();
    let destroyed = false;

    const subscription = manager.onStateChange((state) => {
      setBleState(state);

      // Once we have a definitive state, destroy the temp manager and wait
      // for the async destroy to fully complete before allowing the navigator
      // to mount.  BleManager is a singleton — if destroy() hasn't finished
      // setting sharedInstance = null, the library's new BleManager() call
      // returns the old zombie instance whose native client was destroyed.
      if (state !== State.Unknown && state !== State.Resetting) {
        subscription.remove();
        if (!destroyed) {
          destroyed = true;
          manager.destroy().then(() => setChecking(false));
        }
      }
    }, true);

    return () => {
      subscription.remove();
      if (!destroyed) {
        destroyed = true;
        manager.destroy();
      }
    };
  }, []);

  const goBack = () => router.back();

  if (checking) {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.unavailableMessage}>
          Checking Bluetooth availability...
        </Text>
      </View>
    );
  }

  const unavailableMessage = BLE_STATE_MESSAGES[bleState];
  if (unavailableMessage) {
    return (
      <BleUnavailableScreen message={unavailableMessage} onDismiss={goBack} />
    );
  }

  return (
    <View style={styles.container}>
      <ProvisioningErrorBoundary onDismiss={goBack}>
        <ProvisioningNavigator
          onComplete={(result) => {
            console.log('Provisioning complete:', result);
            goBack();
          }}
          onDismiss={goBack}
        />
      </ProvisioningErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  unavailableIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  unavailableTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  unavailableMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  dismissButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  dismissButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
