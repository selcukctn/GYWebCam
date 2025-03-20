import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, Button, Alert, TextInput, Modal, Platform } from 'react-native';
import { CameraView, CameraType, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { io, Socket } from 'socket.io-client';

interface CameraScreenProps {}

const CameraScreen: React.FC<CameraScreenProps> = () => {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [isStreaming, setIsStreaming] = useState(false);
  const [serverIP, setServerIP] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isConnectionModalVisible, setIsConnectionModalVisible] = useState(false);
  const [isConnectionTypeModalVisible, setIsConnectionTypeModalVisible] = useState(true);
  const [connectionCode, setConnectionCode] = useState('');
  const [isUsbConnection, setIsUsbConnection] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const cameraRef = useRef<any>(null);
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (serverIP) {
      console.log('Socket bağlantısı kuruluyor:', serverIP);
      // iOS USB bağlantısı için localhost desteği
      const connectionUrl = isUsbConnection ? 
        'http://localhost:3000' : 
        `http://${serverIP}:3000`;
      
      console.log('Bağlantı URL:', connectionUrl);
      socketRef.current = io(connectionUrl);
      
      socketRef.current.on('connect', () => {
        console.log('Socket bağlantısı başarılı');
        Alert.alert('Bağlantı Başarılı', 'Bilgisayar ile bağlantı kuruldu.');
      });

      socketRef.current.on('disconnect', () => {
        console.log('Socket bağlantısı koptu');
        setIsStreaming(false);
        Alert.alert('Bağlantı Kesildi', 'Bilgisayar ile bağlantı koptu.');
      });

      return () => {
        console.log('Socket bağlantısı kapatılıyor');
        stopStreaming();
        socketRef.current?.disconnect();
      };
    }
  }, [serverIP, isUsbConnection]);

  const handleUsbConnection = () => {
    setIsUsbConnection(true);
    setIsConnectionTypeModalVisible(false);
    setServerIP('localhost');
    setIsScanning(false);
  };

  const handleWirelessConnection = () => {
    setIsUsbConnection(false);
    setIsConnectionTypeModalVisible(false);
    setIsScanning(true);
  };

  const captureAndSendFrame = async () => {
    if (!socketRef.current?.connected || !cameraRef.current) {
      console.log('Stream durumu:', {
        socketConnected: socketRef.current?.connected,
        cameraReady: !!cameraRef.current
      });
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        base64: true,
        skipProcessing: true,
        exif: false,
        imageType: 'jpeg',
        width: 640,
        height: 480
      });

      if (photo.base64 && socketRef.current?.connected) {
        const frameData = {
          frame: photo.base64,
          timestamp: Date.now()
        };
        
        console.log('Frame gönderiliyor:', {
          size: (photo.base64.length / 1024).toFixed(2) + 'KB',
          timestamp: frameData.timestamp,
          socketId: socketRef.current.id
        });

        socketRef.current.emit('camera-frame', frameData);
      } else {
        console.log('Frame gönderilemedi:', {
          hasBase64: !!photo.base64,
          socketConnected: socketRef.current?.connected
        });
      }

      if (socketRef.current?.connected && cameraRef.current) {
        streamTimeoutRef.current = setTimeout(captureAndSendFrame, 33);
      }
    } catch (error) {
      console.error('Frame gönderme hatası:', error);
      
      if (error instanceof Error) {
        Alert.alert('Frame Hatası', error.message);
      }
      stopStreaming();
    }
  };

  const startStreaming = async () => {
    if (!socketRef.current?.connected || !cameraRef.current) {
        Alert.alert('Hata', 'Kamera veya bağlantı hazır değil');
        console.log('Kamera veya socket bağlantısı yok:', {
            socketConnected: socketRef.current?.connected,
            cameraReady: !!cameraRef.current
        });
        return;
    }

    try {
        console.log('Yayın başlatılıyor...');
        setIsStreaming(true);
        await captureAndSendFrame();
    } catch (error) {
        console.error('Stream başlatma hatası:', error);
        if (error instanceof Error) {
            Alert.alert('Stream Hatası', error.message);
        }
        stopStreaming();
    }
  };

  const stopStreaming = () => {
    console.log('Yayın durduruluyor...');
    setIsStreaming(false);
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
    setIsScanning(true);
    setServerIP('');
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    try {
      if (!isScanning) return;
      
      const data = result.data;
      console.log('Okunan QR kod:', data);
      
      let serverUrl;
      try {
        serverUrl = new URL(data);
      } catch (e) {
        console.log('Geçersiz URL formatı');
        return;
      }

      const ip = serverUrl.hostname;
      console.log('Çıkarılan IP:', ip);
      
      if (ip) {
        setServerIP(ip);
        setIsScanning(false);
        Alert.alert('Bağlantı Bilgisi', `Sunucu adresi: ${ip}`);
      }
    } catch (error) {
      console.error('QR kod okuma hatası:', error);
    }
  };

  const handleConnectionCode = () => {
    if (connectionCode.length < 6) {
      Alert.alert('Hata', 'Lütfen geçerli bir bağlantı kodu girin');
      return;
    }

    const ip = connectionCode.replace(/-/g, '.');
    setServerIP(ip);
    setIsConnectionModalVisible(false);
    setConnectionCode('');
  };

  const startScanning = () => {
    setIsScanning(true);
    setFacing('back');
  };

  const ConnectionModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isConnectionModalVisible}
      onRequestClose={() => setIsConnectionModalVisible(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Bağlantı Kodu</Text>
          <TextInput
            style={styles.input}
            placeholder="Örn: 192-168-1-100"
            value={connectionCode}
            onChangeText={setConnectionCode}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="ascii-capable"
            blurOnSubmit={true}
            returnKeyType="done"
            onSubmitEditing={() => {
              handleConnectionCode();
            }}
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => setIsConnectionModalVisible(false)}
            >
              <Text style={styles.buttonText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.connectButton]}
              onPress={handleConnectionCode}
            >
              <Text style={styles.buttonText}>Bağlan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const ConnectionTypeModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isConnectionTypeModalVisible}
      onRequestClose={() => setIsConnectionTypeModalVisible(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Bağlantı Tipini Seçin</Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.button, styles.connectButton, { marginRight: 10 }]}
              onPress={handleUsbConnection}
            >
              <Text style={styles.buttonText}>Kablolu Bağlantı</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.connectButton]}
              onPress={handleWirelessConnection}
            >
              <Text style={styles.buttonText}>Kablosuz Bağlantı</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>Kamera izinleri yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>Kamera iznine ihtiyacımız var</Text>
          <Button onPress={requestPermission} title="İzin Ver" />
        </View>
      </SafeAreaView>
    );
  }

  function toggleCameraFacing() {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }

  return (
    <SafeAreaView style={styles.container}>
      <ConnectionTypeModal />
      {!permission?.granted ? (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>Kamera izni gerekli</Text>
          <Button title="İzin Ver" onPress={requestPermission} />
        </View>
      ) : serverIP && !isScanning ? (
        <View style={styles.container}>
          <CameraView 
            ref={cameraRef}
            style={styles.camera} 
            facing={facing}
          >
            {isUsbConnection && (
              <View style={styles.usbOverlay}>
                <Text style={styles.scanText}>
                  USB bağlantısı bekleniyor...
                </Text>
                <TouchableOpacity
                  style={[styles.button, { marginTop: 10 }]}
                  onPress={() => {
                    setIsConnectionTypeModalVisible(true);
                    setServerIP('');
                  }}
                >
                  <Text style={styles.buttonText}>Bağlantı Tipini Değiştir</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.button}
                onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
              >
                <Text style={styles.buttonText}>Kamera Değiştir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, isStreaming ? styles.stopButton : styles.startButton]}
                onPress={isStreaming ? stopStreaming : startStreaming}
              >
                <Text style={styles.buttonText}>
                  {isStreaming ? 'Yayını Durdur' : 'Yayını Başlat'}
                </Text>
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      ) : (
        <View style={styles.container}>
          <CameraView
            style={styles.camera}
            facing={facing}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          >
            <View style={styles.scanOverlay}>
              <Text style={styles.scanText}>
                Bilgisayarınızda görünen QR kodu tarayın
              </Text>
              <TouchableOpacity
                style={[styles.button, { marginTop: 10 }]}
                onPress={() => setIsConnectionTypeModalVisible(true)}
              >
                <Text style={styles.buttonText}>Bağlantı Tipini Değiştir</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, { marginRight: 10 }]}
                onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
              >
                <Text style={styles.buttonText}>Kamera Değiştir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { marginRight: 10 }]}
                onPress={() => setIsConnectionModalVisible(true)}
              >
                <Text style={styles.buttonText}>Kod ile Bağlan</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, isScanning ? styles.stopButton : styles.startButton]}
                onPress={() => setIsScanning(!isScanning)}
              >
                <Text style={[styles.buttonText, { color: 'white' }]}>
                  {isScanning ? 'Taramayı Durdur' : 'QR Tara'}
                </Text>
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}

      <ConnectionModal />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'center',
    margin: 20,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  button: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 120,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'black',
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  messageText: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    marginBottom: 10,
  },
  scanOverlay: {
    position: 'absolute',
    top: '40%',
    left: 20,
    right: 20,
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    alignItems: 'center',
  },
  scanText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  connectionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionText: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    marginBottom: 10,
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  cancelButton: {
    backgroundColor: '#f44336',
  },
  connectButton: {
    backgroundColor: '#4CAF50',
  },
  usbOverlay: {
    position: 'absolute',
    top: '40%',
    left: 20,
    right: 20,
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    alignItems: 'center',
  },
});

export default CameraScreen;
