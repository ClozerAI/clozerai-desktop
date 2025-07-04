import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { dependencies } from '../../release/app/package.json';
import webpackPaths from '../configs/webpack.paths';

if (
  Object.keys(dependencies || {}).length > 0 &&
  fs.existsSync(webpackPaths.appNodeModulesPath)
) {
  // Get the path to electron in the root node_modules
  const electronPath = path.resolve('../../node_modules/electron');

  const electronRebuildCmd = `../../node_modules/.bin/electron-rebuild --force --types prod,dev,optional --module-dir . --electron-prebuilt-dir ${electronPath}`;
  const cmd =
    process.platform === 'win32'
      ? electronRebuildCmd.replace(/\//g, '\\')
      : electronRebuildCmd;
  execSync(cmd, {
    cwd: webpackPaths.appPath,
    stdio: 'inherit',
  });
}
