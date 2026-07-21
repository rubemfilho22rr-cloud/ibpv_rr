const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('IBPVDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform
}));
