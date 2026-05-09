const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron')
const path = require('path')
const db   = require('./db')

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    title: 'Zeytinyağı Fabrika Sistemi v3 Pro',
    backgroundColor: '#f4f1ea', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Dosya', submenu: [
      { label: 'Çıkış', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
    ]},
    { label: 'Görünüm', submenu: [
      { label: 'Yenile', accelerator: 'F5', click: () => win.reload() },
      { label: 'Tam Ekran', accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
      { label: 'Geliştirici', accelerator: 'F12', click: () => win.webContents.toggleDevTools() }
    ]},
    { label: 'TKGM', submenu: [
      { label: 'Parsel Sorgula', click: () => shell.openExternal('https://parselsorgu.tkgm.gov.tr/') }
    ]}
  ]))

  win.loadFile(path.join(__dirname, '../app/index.html'))
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
}

// ─── IPC HANDLER'LAR ─────────────────────────────────────────────
ipcMain.handle('auth:login',          (_, u, p)        => db.login(u, p))
ipcMain.handle('auth:register',       (_, u, d, p)     => db.register(u, d, p))
ipcMain.handle('auth:changePassword', (_, uid, p)      => db.changePassword(uid, p))
ipcMain.handle('auth:getUsers',       ()               => db.getUsers())
ipcMain.handle('auth:addUser',        (_, data)        => db.addUser(data))
ipcMain.handle('auth:deleteUser',     (_, uid)         => db.deleteUser(uid))
ipcMain.handle('data:load',           (_, uid)         => db.loadData(uid))
ipcMain.handle('data:saveKayit',      (_, uid, r)      => db.saveKayit(uid, r))
ipcMain.handle('data:updateDurum',    (_, id, d)       => db.updateKayitDurum(id, d))
ipcMain.handle('data:saveStok',       (_, uid, s)      => db.saveStok(uid, s))
ipcMain.handle('data:saveSatis',      (_, uid, s)      => db.saveSatis(uid, s))
ipcMain.handle('data:saveCounters',   (_, uid, f, s)   => db.saveCounters(uid, f, s))

app.whenReady().then(async () => {
  await db.initAdmin()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
