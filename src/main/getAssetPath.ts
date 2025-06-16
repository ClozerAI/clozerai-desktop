import path from 'path';
import { app } from 'electron';
export default function getAssetPath(...paths: string[]): string {
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  return path.join(RESOURCES_PATH, ...paths);
}
