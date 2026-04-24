const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveAthlete: (data) => ipcRenderer.invoke('save-athlete', data),
  getAthletes: () => ipcRenderer.invoke('get-athletes'),
  saveResult: (data) => ipcRenderer.invoke('save-result', data),
  getAthleteTests: (athleteId) => ipcRenderer.invoke('get-athlete-tests', athleteId),
  getTopRankings: () => ipcRenderer.invoke('get-top-rankings'),
  getBestMarks: () => ipcRenderer.invoke('get-best-marks')
});