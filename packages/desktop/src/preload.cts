import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("dsrdDesktop", Object.freeze({
  platform: process.platform,
}));
