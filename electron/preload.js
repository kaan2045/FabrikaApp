const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Auth
  login:          (u, p)       => ipcRenderer.invoke('auth:login', u, p),
  register:       (u, d, p)    => ipcRenderer.invoke('auth:register', u, d, p),
  changePassword: (uid, p)     => ipcRenderer.invoke('auth:changePassword', uid, p),
  getUsers:       ()           => ipcRenderer.invoke('auth:getUsers'),
  addUser:        (data)       => ipcRenderer.invoke('auth:addUser', data),
  deleteUser:     (uid)        => ipcRenderer.invoke('auth:deleteUser', uid),
  // Veri
  loadData:       (uid)        => ipcRenderer.invoke('data:load', uid),
  saveKayit:      (uid, r)     => ipcRenderer.invoke('data:saveKayit', uid, r),
  updateDurum:    (id, d)      => ipcRenderer.invoke('data:updateDurum', id, d),
  saveStok:       (uid, s)     => ipcRenderer.invoke('data:saveStok', uid, s),
  saveSatis:      (uid, s)     => ipcRenderer.invoke('data:saveSatis', uid, s),
  saveCounters:   (uid, f, s)  => ipcRenderer.invoke('data:saveCounters', uid, f, s),
})
