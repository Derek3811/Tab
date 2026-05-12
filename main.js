const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let printWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
}

function createPrintWindow() {
  printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  printWindow.loadFile('print.html');
}

app.whenReady().then(() => {
  createWindow();
  createPrintWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('read-folder', async (event, folderPath) => {
  try {
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) return null;

    const items = fs.readdirSync(folderPath, { withFileTypes: true });
    
    let subfolders = items.filter(item => item.isDirectory()).map(item => item.name);
    let files = items.filter(item => item.isFile()).map(item => item.name);
    
    // Process names: only remove extensions if file
    const cleanName = (name, isFile) => {
      let cleaned = isFile ? name.replace(/\.[^/.]+$/, "") : name;
      return cleaned.trim();
    };

    let result = [];
    if (subfolders.length > 0) {
      result = subfolders.map(n => cleanName(n, false));
    } else {
      result = files.map(n => cleanName(n, true));
    }
    
    return result;
  } catch (error) {
    console.error('Error reading folder:', error);
    return [];
  }
});

ipcMain.handle('read-text-file', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) return null;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    return lines;
  } catch (error) {
    console.error('Error reading text file:', error);
    return [];
  }
});

ipcMain.handle('get-printers', async (event) => {
  if (mainWindow) {
    return mainWindow.webContents.getPrintersAsync();
  }
  return [];
});

ipcMain.handle('print-tabs', async (event, printData) => {
  return new Promise((resolve, reject) => {
    if (!printWindow) {
      reject('Print window not initialized');
      return;
    }

    // Send data to print window to render
    printWindow.webContents.send('render-print-job', printData);

    ipcMain.once('print-job-rendered', async () => {
      try {
        let pageSize = 'Letter';
        if (printData.paperSize === '9x11') {
          pageSize = { width: 228600, height: 279400 }; // 9x11 inches in microns
        }

        const printOptions = {
          silent: !printData.showDialog,
          printBackground: true,
          color: false,
          margins: {
            marginType: 'none'
          },
          landscape: true,
          pageSize: pageSize,
          copies: printData.copies || 1
        };

        if (printData.pageRange) {
          const ranges = [];
          const parts = printData.pageRange.split(',');
          for (let part of parts) {
            part = part.trim();
            if (!part) continue;
            if (part.includes('-')) {
              const bounds = part.split('-');
              const from = parseInt(bounds[0], 10) - 1;
              const to = parseInt(bounds[1], 10) - 1;
              if (!isNaN(from) && !isNaN(to)) {
                ranges.push({ from, to });
              }
            } else {
              const num = parseInt(part, 10) - 1;
              if (!isNaN(num)) {
                ranges.push({ from: num, to: num });
              }
            }
          }
          if (ranges.length > 0) {
            printOptions.pageRanges = ranges;
          }
        }

        // Always pass deviceName if selected to pre-select it in dialog
        if (printData.printerName) {
          printOptions.deviceName = printData.printerName;
        }

        printWindow.webContents.print(printOptions, (success, failureReason) => {
          if (!success) {
            console.error('Print failed:', failureReason);
            resolve({ success: false, error: failureReason });
          } else {
            resolve({ success: true });
          }
        });
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  });
});
