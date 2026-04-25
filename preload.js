const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveAthlete: (data) => ipcRenderer.invoke('save-athlete', data),
  getAthletes: () => ipcRenderer.invoke('get-athletes'),
  saveResult: (data) => ipcRenderer.invoke('save-result', data),
  getAthleteTests: (athleteId) => ipcRenderer.invoke('get-athlete-tests', athleteId),
  getTopRankings: () => ipcRenderer.invoke('get-top-rankings'),
  getBestMarks: () => ipcRenderer.invoke('get-best-marks'),
  deleteAthlete: (athleteId) => ipcRenderer.invoke('delete-athlete', athleteId),
  updateAthlete: (data) => ipcRenderer.invoke('update-athlete', data),
  getAthleteById: (athleteId) => ipcRenderer.invoke('get-athlete-by-id', athleteId),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),
  exportToExcel: () => ipcRenderer.invoke('export-to-excel'),
  getCurrentResult: (athleteId, testName) => ipcRenderer.invoke('get-current-result', athleteId, testName),
  getCurrentResultsForAthlete: (athleteId) => ipcRenderer.invoke('get-current-results-for-athlete', athleteId)
});