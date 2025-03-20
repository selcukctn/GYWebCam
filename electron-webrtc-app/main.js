const { app, BrowserWindow, ipcMain } = require('electron');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const ip = require('ip');

const expressApp = express();
const httpServer = createServer(expressApp);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    transports: ['websocket', 'polling']
  },
  allowEIO3: true
});

// Express middleware
expressApp.use(express.json());
expressApp.use(express.static(__dirname));

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const ipAddress = ip.address();
  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
  
  // IP adresini pencereye gönder
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('server-ip', ipAddress);
  });
}

// Socket.IO sunucusu
io.on('connection', (socket) => {
  console.log('Yeni bağlantı:', socket.id);

  socket.on('camera-frame', (data) => {
    try {
      if (!data || !data.frame) {
        console.error('Geçersiz frame verisi:', data);
        return;
      }
      
      const frameSize = data.frame.length;
      console.log(`Frame alındı - Socket: ${socket.id}, Boyut: ${(frameSize / 1024).toFixed(2)}KB`);
      
      // Frame'i tüm bağlı istemcilere gönder (gönderen hariç)
      io.emit('camera-frame', {
        frame: data.frame,
        timestamp: data.timestamp
      });
    } catch (error) {
      console.error('Frame işleme hatası:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Bağlantı koptu:', socket.id);
  });
});

// QR kod oluşturma
ipcMain.on('generate-qr', (event) => {
  const ipAddress = ip.address();
  const serverUrl = `http://${ipAddress}:3000`;
  console.log('QR kod için URL:', serverUrl);
  QRCode.toDataURL(serverUrl, (err, url) => {
    if (err) {
      console.error('QR kod oluşturma hatası:', err);
      return;
    }
    event.sender.send('qr-generated', {
      qrUrl: url,
      ip: ipAddress,
      serverUrl: serverUrl
    });
  });
});

app.whenReady().then(() => {
  const PORT = 3000;
  
  // Önce HTTP sunucusunu başlat
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu başlatıldı: http://${ip.address()}:${PORT}`);
    // Sonra pencereyi oluştur
    createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});