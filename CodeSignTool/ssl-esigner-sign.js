// scripts/ssl-esigner-sign.js
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function (cfg) {
  // TODO: Remove this once we have a valid certificate
  return;

  if (!cfg.path) return; // electron-builder calls this many times; only act when there's a file path
  const file = String(cfg.path);

  // Only sign the final installer/setup files, not individual app files
  const isInstallerFile = /Setup.*\.exe$/i.test(path.basename(file));
  if (!isInstallerFile) {
    console.log(
      `Skipping code signing for: ${file} (not an installer file with "Setup" in name ending with .exe)`,
    );
    return;
  }

  console.log(`Code signing installer: ${file}`);

  const TOOL = path.join(__dirname, 'CodeSignTool.sh');

  // Read secrets from env (set these in your CI)
  const username = process.env.ES_USERNAME;
  const password = process.env.ES_PASSWORD;
  const credentialId = process.env.ES_CREDENTIAL_ID; // optional if only one credential
  const totpSecret = process.env.ES_TOTP_SECRET; // optional if doing manual OTP

  // Check required environment variables
  if (!username || !password || !credentialId || !totpSecret) {
    throw new Error(
      'ES_USERNAME, ES_PASSWORD, ES_CREDENTIAL_ID, and ES_TOTP_SECRET environment variables are required for code signing',
    );
  }

  const args = [
    'sign',
    username && `-username=${username}`,
    password && `-password=${password}`,
    credentialId && `-credential_id=${credentialId}`,
    totpSecret && `-totp_secret=${totpSecret}`, // enables unattended signing
    `-input_file_path=${path.resolve(file)}`,
    `-override=true`,
  ].filter(Boolean);

  execFileSync(TOOL, args, { stdio: 'inherit', cwd: __dirname });
};
