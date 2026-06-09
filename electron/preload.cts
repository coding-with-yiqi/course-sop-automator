import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getPath: (name: string) => Promise<string>;
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
}

const api: ElectronAPI = {
  getPath: (name: string) => ipcRenderer.invoke('electron:get-path', name),
  showOpenDialog: (options) => ipcRenderer.invoke('electron:show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('electron:show-save-dialog', options),
};

contextBridge.exposeInMainWorld('electronAPI', api);
