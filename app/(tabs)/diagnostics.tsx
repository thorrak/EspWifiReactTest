import { useEffect, useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View,
  Text,
  Platform,
} from 'react-native';
import { BleManager, Device, State, BleError } from 'react-native-ble-plx';

// Hardcoded from esp-wifi-manager-react-native constants
const SERVICE_UUID = '0000FFE0-0000-1000-8000-00805F9B34FB';
const STATUS_CHAR_UUID = '0000FFE1-0000-1000-8000-00805F9B34FB';
const COMMAND_CHAR_UUID = '0000FFE2-0000-1000-8000-00805F9B34FB';
const RESPONSE_CHAR_UUID = '0000FFE3-0000-1000-8000-00805F9B34FB';
const DEVICE_NAME_PREFIX = 'ESP32-WiFi-';

type StepStatus = 'pending' | 'running' | 'pass' | 'fail';

interface LogEntry {
  time: string;
  message: string;
}

interface DiscoveredDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  serviceUUIDs: string[] | null;
}

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 });
}

function StatusBadge({ status }: { status: StepStatus }) {
  const config = {
    pending: { label: 'PENDING', bg: '#8E8E93' },
    running: { label: 'RUNNING', bg: '#FF9500' },
    pass: { label: 'PASS', bg: '#34C759' },
    fail: { label: 'FAIL', bg: '#FF3B30' },
  }[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={styles.badgeText}>{config.label}</Text>
    </View>
  );
}

function LogView({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) return null;
  return (
    <View style={styles.logContainer}>
      {logs.map((entry, i) => (
        <Text key={i} style={styles.logText}>
          <Text style={styles.logTime}>[{entry.time}]</Text> {entry.message}
        </Text>
      ))}
    </View>
  );
}

export default function DiagnosticsScreen() {
  const bleManagerRef = useRef<BleManager | null>(null);
  const connectedDeviceRef = useRef<Device | null>(null);
  const scanSubscriptionRef = useRef<{ remove: () => void } | null>(null);

  // Step statuses
  const [createStatus, setCreateStatus] = useState<StepStatus>('pending');
  const [stateStatus, setStateStatus] = useState<StepStatus>('pending');
  const [scanStatus, setScanStatus] = useState<StepStatus>('pending');
  const [filteredScanStatus, setFilteredScanStatus] = useState<StepStatus>('pending');
  const [connectStatus, setConnectStatus] = useState<StepStatus>('pending');
  const [discoverStatus, setDiscoverStatus] = useState<StepStatus>('pending');
  const [validateStatus, setValidateStatus] = useState<StepStatus>('pending');

  // Step logs
  const [createLogs, setCreateLogs] = useState<LogEntry[]>([]);
  const [stateLogs, setStateLogs] = useState<LogEntry[]>([]);
  const [scanLogs, setScanLogs] = useState<LogEntry[]>([]);
  const [filteredScanLogs, setFilteredScanLogs] = useState<LogEntry[]>([]);
  const [connectLogs, setConnectLogs] = useState<LogEntry[]>([]);
  const [discoverLogs, setDiscoverLogs] = useState<LogEntry[]>([]);
  const [validateLogs, setValidateLogs] = useState<LogEntry[]>([]);

  // Discovered devices
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<DiscoveredDevice[]>([]);

  // BLE state
  const [bleState, setBleState] = useState<string>('Unknown');

  // Expanded sections
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    create: true,
    state: true,
    scan: true,
    filteredScan: true,
    connect: true,
    discover: true,
    validate: true,
  });

  const addLog = useCallback(
    (setter: React.Dispatch<React.SetStateAction<LogEntry[]>>, message: string) => {
      setter((prev) => [...prev, { time: timestamp(), message }]);
    },
    []
  );

  const toggleSection = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      scanSubscriptionRef.current?.remove();
      if (connectedDeviceRef.current) {
        connectedDeviceRef.current.cancelConnection().catch(() => {});
      }
      if (bleManagerRef.current) {
        bleManagerRef.current.destroy();
      }
    };
  }, []);

  // Step 1: Create BleManager
  const runCreateManager = useCallback(() => {
    if (bleManagerRef.current) {
      addLog(setCreateLogs, 'BleManager already exists, destroying first...');
      bleManagerRef.current.destroy();
      bleManagerRef.current = null;
    }

    setCreateStatus('running');
    setCreateLogs([]);
    addLog(setCreateLogs, 'Creating new BleManager()...');

    try {
      const manager = new BleManager();
      bleManagerRef.current = manager;
      addLog(setCreateLogs, 'BleManager created successfully');
      setCreateStatus('pass');
    } catch (error: any) {
      addLog(setCreateLogs, `FAILED: ${error.message}`);
      setCreateStatus('fail');
    }
  }, [addLog]);

  // Step 2: Check BLE State
  const runCheckState = useCallback(() => {
    const manager = bleManagerRef.current;
    if (!manager) {
      addLog(setStateLogs, 'ERROR: No BleManager — run Step 1 first');
      setStateStatus('fail');
      return;
    }

    setStateStatus('running');
    setStateLogs([]);
    addLog(setStateLogs, 'Checking BLE adapter state...');

    manager.state().then((state) => {
      setBleState(state);
      addLog(setStateLogs, `Current state: ${state}`);

      if (state === State.PoweredOn) {
        setStateStatus('pass');
      } else {
        addLog(setStateLogs, `Waiting for state change (currently ${state})...`);
        const sub = manager.onStateChange((newState) => {
          setBleState(newState);
          addLog(setStateLogs, `State changed to: ${newState}`);
          if (newState === State.PoweredOn) {
            setStateStatus('pass');
            sub.remove();
          }
        }, true);

        // Timeout after 10s
        setTimeout(() => {
          if (stateStatus === 'running') {
            addLog(setStateLogs, 'Timed out waiting for PoweredOn');
            setStateStatus('fail');
            sub.remove();
          }
        }, 10000);
      }
    });
  }, [addLog, stateStatus]);

  // Step 3: Unfiltered Scan
  const runUnfilteredScan = useCallback(() => {
    const manager = bleManagerRef.current;
    if (!manager) {
      addLog(setScanLogs, 'ERROR: No BleManager — run Step 1 first');
      setScanStatus('fail');
      return;
    }

    setScanStatus('running');
    setScanLogs([]);
    setDevices([]);
    addLog(setScanLogs, 'Starting unfiltered scan for 10 seconds...');

    const seen = new Map<string, DiscoveredDevice>();

    manager.startDeviceScan(null, null, (error: BleError | null, device: Device | null) => {
      if (error) {
        addLog(setScanLogs, `Scan error: [${error.errorCode}] ${error.message}`);
        setScanStatus('fail');
        return;
      }

      if (device && !seen.has(device.id)) {
        const entry: DiscoveredDevice = {
          id: device.id,
          name: device.name ?? device.localName ?? null,
          rssi: device.rssi,
          serviceUUIDs: device.serviceUUIDs,
        };
        seen.set(device.id, entry);
        setDevices(Array.from(seen.values()));

        const nameStr = entry.name ?? '(unnamed)';
        const isEsp = entry.name?.startsWith(DEVICE_NAME_PREFIX);
        addLog(
          setScanLogs,
          `Found: ${nameStr} | ${device.id} | RSSI: ${entry.rssi}${isEsp ? ' *** ESP32 ***' : ''}`
        );
      }
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      addLog(setScanLogs, `Scan complete. Found ${seen.size} device(s).`);
      const espCount = Array.from(seen.values()).filter((d) =>
        d.name?.startsWith(DEVICE_NAME_PREFIX)
      ).length;
      addLog(setScanLogs, `ESP32 devices (name starts with "${DEVICE_NAME_PREFIX}"): ${espCount}`);
      setScanStatus(seen.size > 0 ? 'pass' : 'fail');
    }, 10000);
  }, [addLog]);

  // Step 4: UUID-Filtered Scan
  const runFilteredScan = useCallback(() => {
    const manager = bleManagerRef.current;
    if (!manager) {
      addLog(setFilteredScanLogs, 'ERROR: No BleManager — run Step 1 first');
      setFilteredScanStatus('fail');
      return;
    }

    setFilteredScanStatus('running');
    setFilteredScanLogs([]);
    setFilteredDevices([]);
    addLog(setFilteredScanLogs, `Starting scan with UUID filter [${SERVICE_UUID}] for 10 seconds...`);

    const seen = new Map<string, DiscoveredDevice>();

    manager.startDeviceScan(
      [SERVICE_UUID],
      null,
      (error: BleError | null, device: Device | null) => {
        if (error) {
          addLog(setFilteredScanLogs, `Scan error: [${error.errorCode}] ${error.message}`);
          setFilteredScanStatus('fail');
          return;
        }

        if (device && !seen.has(device.id)) {
          const entry: DiscoveredDevice = {
            id: device.id,
            name: device.name ?? device.localName ?? null,
            rssi: device.rssi,
            serviceUUIDs: device.serviceUUIDs,
          };
          seen.set(device.id, entry);
          setFilteredDevices(Array.from(seen.values()));
          addLog(
            setFilteredScanLogs,
            `Found: ${entry.name ?? '(unnamed)'} | ${device.id} | RSSI: ${entry.rssi}`
          );
        }
      }
    );

    setTimeout(() => {
      manager.stopDeviceScan();
      addLog(setFilteredScanLogs, `Filtered scan complete. Found ${seen.size} device(s).`);
      setFilteredScanStatus(seen.size > 0 ? 'pass' : 'fail');
    }, 10000);
  }, [addLog]);

  // Step 5: Connect to device
  const runConnect = useCallback(
    async (device: DiscoveredDevice) => {
      const manager = bleManagerRef.current;
      if (!manager) {
        addLog(setConnectLogs, 'ERROR: No BleManager');
        setConnectStatus('fail');
        return;
      }

      setConnectStatus('running');
      setConnectLogs([]);
      addLog(setConnectLogs, `Connecting to ${device.name ?? device.id}...`);

      try {
        const connected = await manager.connectToDevice(device.id, {
          requestMTU: 517,
          timeout: 10000,
        });
        connectedDeviceRef.current = connected;

        const mtu = connected.mtu;
        addLog(setConnectLogs, `Connected! MTU: ${mtu}`);
        addLog(setConnectLogs, `Device ID: ${connected.id}`);
        addLog(setConnectLogs, `Device name: ${connected.name ?? '(null)'}`);
        setConnectStatus('pass');
      } catch (error: any) {
        addLog(setConnectLogs, `Connection FAILED: ${error.message}`);
        if (error.errorCode) {
          addLog(setConnectLogs, `Error code: ${error.errorCode}`);
        }
        setConnectStatus('fail');
      }
    },
    [addLog]
  );

  // Step 6: Discover Services
  const runDiscoverServices = useCallback(async () => {
    const device = connectedDeviceRef.current;
    if (!device) {
      addLog(setDiscoverLogs, 'ERROR: No connected device — run Step 5 first');
      setDiscoverStatus('fail');
      return;
    }

    setDiscoverStatus('running');
    setDiscoverLogs([]);
    addLog(setDiscoverLogs, 'Discovering all services and characteristics...');

    try {
      const discovered = await device.discoverAllServicesAndCharacteristics();
      const services = await discovered.services();

      addLog(setDiscoverLogs, `Found ${services.length} service(s):`);

      for (const service of services) {
        addLog(setDiscoverLogs, `\n  Service: ${service.uuid}`);
        const chars = await service.characteristics();
        for (const char of chars) {
          const props = [];
          if (char.isReadable) props.push('Read');
          if (char.isWritableWithResponse) props.push('Write');
          if (char.isWritableWithoutResponse) props.push('WriteNoResp');
          if (char.isNotifiable) props.push('Notify');
          if (char.isIndicatable) props.push('Indicate');
          addLog(setDiscoverLogs, `    Char: ${char.uuid} [${props.join(', ')}]`);
        }
      }

      setDiscoverStatus('pass');
    } catch (error: any) {
      addLog(setDiscoverLogs, `Discovery FAILED: ${error.message}`);
      setDiscoverStatus('fail');
    }
  }, [addLog]);

  // Step 7: Validate expected characteristics
  const runValidateChars = useCallback(async () => {
    const device = connectedDeviceRef.current;
    if (!device) {
      addLog(setValidateLogs, 'ERROR: No connected device');
      setValidateStatus('fail');
      return;
    }

    setValidateStatus('running');
    setValidateLogs([]);
    addLog(setValidateLogs, `Looking for service ${SERVICE_UUID}...`);

    try {
      const services = await device.services();
      const targetService = services.find(
        (s) => s.uuid.toUpperCase() === SERVICE_UUID.toUpperCase()
      );

      if (!targetService) {
        addLog(setValidateLogs, `Service ${SERVICE_UUID} NOT FOUND`);
        addLog(setValidateLogs, `Available services: ${services.map((s) => s.uuid).join(', ')}`);
        setValidateStatus('fail');
        return;
      }

      addLog(setValidateLogs, 'Service found! Checking characteristics...');
      const chars = await targetService.characteristics();
      const charUUIDs = chars.map((c) => c.uuid.toUpperCase());

      const expected = [
        { uuid: STATUS_CHAR_UUID, name: 'Status (FFE1)' },
        { uuid: COMMAND_CHAR_UUID, name: 'Command (FFE2)' },
        { uuid: RESPONSE_CHAR_UUID, name: 'Response (FFE3)' },
      ];

      let allFound = true;
      for (const exp of expected) {
        const found = charUUIDs.includes(exp.uuid.toUpperCase());
        addLog(setValidateLogs, `  ${found ? 'FOUND' : 'MISSING'}: ${exp.name} (${exp.uuid})`);
        if (!found) allFound = false;
      }

      // Show any extra characteristics
      const expectedUUIDs = expected.map((e) => e.uuid.toUpperCase());
      const extras = chars.filter((c) => !expectedUUIDs.includes(c.uuid.toUpperCase()));
      if (extras.length > 0) {
        addLog(setValidateLogs, `\nExtra characteristics on this service:`);
        for (const c of extras) {
          addLog(setValidateLogs, `  ${c.uuid}`);
        }
      }

      setValidateStatus(allFound ? 'pass' : 'fail');
    } catch (error: any) {
      addLog(setValidateLogs, `Validation FAILED: ${error.message}`);
      setValidateStatus('fail');
    }
  }, [addLog]);

  // Auto-run steps 1-2 on mount
  useEffect(() => {
    runCreateManager();
    // Small delay to let BleManager initialize before checking state
    const timer = setTimeout(() => runCheckState(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderDeviceList = (
    deviceList: DiscoveredDevice[],
    onTap?: (device: DiscoveredDevice) => void
  ) => {
    if (deviceList.length === 0) return null;
    return (
      <View style={styles.deviceList}>
        {deviceList.map((d) => (
          <TouchableOpacity
            key={d.id}
            style={[styles.deviceItem, d.name?.startsWith(DEVICE_NAME_PREFIX) && styles.espDevice]}
            onPress={() => onTap?.(d)}
            disabled={!onTap}
          >
            <Text style={styles.deviceName}>{d.name ?? '(unnamed)'}</Text>
            <Text style={styles.deviceDetail}>
              {d.id} | RSSI: {d.rssi ?? 'N/A'}
            </Text>
            {d.serviceUUIDs && d.serviceUUIDs.length > 0 && (
              <Text style={styles.deviceDetail}>
                Services: {d.serviceUUIDs.join(', ')}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>BLE Diagnostics</Text>
      <Text style={styles.subtitle}>
        Tests BLE operations directly via react-native-ble-plx
      </Text>

      {/* Step 1: Create BleManager */}
      <TouchableOpacity style={styles.card} onPress={() => toggleSection('create')}>
        <View style={styles.cardHeader}>
          <Text style={styles.stepLabel}>1. Create BleManager</Text>
          <StatusBadge status={createStatus} />
        </View>
        {expanded.create && (
          <View style={styles.cardBody}>
            <TouchableOpacity style={styles.actionButton} onPress={runCreateManager}>
              <Text style={styles.actionButtonText}>Create / Recreate</Text>
            </TouchableOpacity>
            <LogView logs={createLogs} />
          </View>
        )}
      </TouchableOpacity>

      {/* Step 2: Check BLE State */}
      <TouchableOpacity style={styles.card} onPress={() => toggleSection('state')}>
        <View style={styles.cardHeader}>
          <Text style={styles.stepLabel}>2. BLE Adapter State</Text>
          <StatusBadge status={stateStatus} />
        </View>
        {expanded.state && (
          <View style={styles.cardBody}>
            <Text style={styles.stateText}>Current: {bleState}</Text>
            <TouchableOpacity style={styles.actionButton} onPress={runCheckState}>
              <Text style={styles.actionButtonText}>Re-check State</Text>
            </TouchableOpacity>
            <LogView logs={stateLogs} />
          </View>
        )}
      </TouchableOpacity>

      {/* Step 3: Unfiltered Scan */}
      <TouchableOpacity style={styles.card} onPress={() => toggleSection('scan')}>
        <View style={styles.cardHeader}>
          <Text style={styles.stepLabel}>3. Scan (No Filter)</Text>
          <StatusBadge status={scanStatus} />
        </View>
        {expanded.scan && (
          <View style={styles.cardBody}>
            <Text style={styles.hint}>Scans for ALL BLE devices for 10 seconds</Text>
            <TouchableOpacity
              style={[styles.actionButton, scanStatus === 'running' && styles.disabledButton]}
              onPress={runUnfilteredScan}
              disabled={scanStatus === 'running'}
            >
              <Text style={styles.actionButtonText}>
                {scanStatus === 'running' ? 'Scanning...' : 'Start Scan'}
              </Text>
            </TouchableOpacity>
            {renderDeviceList(devices, runConnect)}
            <LogView logs={scanLogs} />
          </View>
        )}
      </TouchableOpacity>

      {/* Step 4: UUID-Filtered Scan */}
      <TouchableOpacity style={styles.card} onPress={() => toggleSection('filteredScan')}>
        <View style={styles.cardHeader}>
          <Text style={styles.stepLabel}>4. Scan (UUID Filter)</Text>
          <StatusBadge status={filteredScanStatus} />
        </View>
        {expanded.filteredScan && (
          <View style={styles.cardBody}>
            <Text style={styles.hint}>Scans for service {SERVICE_UUID} for 10 seconds</Text>
            <TouchableOpacity
              style={[
                styles.actionButton,
                filteredScanStatus === 'running' && styles.disabledButton,
              ]}
              onPress={runFilteredScan}
              disabled={filteredScanStatus === 'running'}
            >
              <Text style={styles.actionButtonText}>
                {filteredScanStatus === 'running' ? 'Scanning...' : 'Start Filtered Scan'}
              </Text>
            </TouchableOpacity>
            {renderDeviceList(filteredDevices, runConnect)}
            <LogView logs={filteredScanLogs} />
          </View>
        )}
      </TouchableOpacity>

      {/* Step 5: Connect */}
      <TouchableOpacity style={styles.card} onPress={() => toggleSection('connect')}>
        <View style={styles.cardHeader}>
          <Text style={styles.stepLabel}>5. Connect</Text>
          <StatusBadge status={connectStatus} />
        </View>
        {expanded.connect && (
          <View style={styles.cardBody}>
            <Text style={styles.hint}>Tap a device from scan results above to connect</Text>
            <LogView logs={connectLogs} />
          </View>
        )}
      </TouchableOpacity>

      {/* Step 6: Discover Services */}
      <TouchableOpacity style={styles.card} onPress={() => toggleSection('discover')}>
        <View style={styles.cardHeader}>
          <Text style={styles.stepLabel}>6. Discover Services</Text>
          <StatusBadge status={discoverStatus} />
        </View>
        {expanded.discover && (
          <View style={styles.cardBody}>
            <TouchableOpacity
              style={[styles.actionButton, connectStatus !== 'pass' && styles.disabledButton]}
              onPress={runDiscoverServices}
              disabled={connectStatus !== 'pass'}
            >
              <Text style={styles.actionButtonText}>Discover Services</Text>
            </TouchableOpacity>
            <LogView logs={discoverLogs} />
          </View>
        )}
      </TouchableOpacity>

      {/* Step 7: Validate Characteristics */}
      <TouchableOpacity style={styles.card} onPress={() => toggleSection('validate')}>
        <View style={styles.cardHeader}>
          <Text style={styles.stepLabel}>7. Validate Characteristics</Text>
          <StatusBadge status={validateStatus} />
        </View>
        {expanded.validate && (
          <View style={styles.cardBody}>
            <TouchableOpacity
              style={[styles.actionButton, discoverStatus !== 'pass' && styles.disabledButton]}
              onPress={runValidateChars}
              disabled={discoverStatus !== 'pass'}
            >
              <Text style={styles.actionButtonText}>Validate</Text>
            </TouchableOpacity>
            <LogView logs={validateLogs} />
          </View>
        )}
      </TouchableOpacity>

      {/* Disconnect button */}
      {connectStatus === 'pass' && (
        <TouchableOpacity
          style={[styles.actionButton, styles.disconnectButton]}
          onPress={async () => {
            try {
              await connectedDeviceRef.current?.cancelConnection();
              connectedDeviceRef.current = null;
              setConnectStatus('pending');
              setConnectLogs([]);
              setDiscoverStatus('pending');
              setDiscoverLogs([]);
              setValidateStatus('pending');
              setValidateLogs([]);
            } catch {}
          }}
        >
          <Text style={styles.actionButtonText}>Disconnect</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  cardBody: {
    padding: 14,
    paddingTop: 0,
    gap: 10,
  },
  stepLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#3A3A3C',
  },
  disconnectButton: {
    backgroundColor: '#FF3B30',
    alignSelf: 'center',
    marginTop: 8,
  },
  hint: {
    fontSize: 12,
    color: '#8E8E93',
  },
  stateText: {
    fontSize: 15,
    color: '#FFF',
    fontWeight: '500',
  },
  logContainer: {
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 10,
  },
  logText: {
    fontSize: 11,
    color: '#30D158',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  logTime: {
    color: '#8E8E93',
  },
  deviceList: {
    gap: 6,
  },
  deviceItem: {
    backgroundColor: '#2C2C2E',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3A3A3C',
  },
  espDevice: {
    borderLeftColor: '#34C759',
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  deviceDetail: {
    fontSize: 11,
    color: '#8E8E93',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
});
