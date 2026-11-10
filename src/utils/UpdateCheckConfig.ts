import fs from 'fs';
import path from 'path';
import { getConfigPath } from './Config';
import { isTruthyOptInValue } from './EnvFlags';

export function readUpdateCheckEnabled(): boolean {
  try {
    const settings = JSON.parse(
      fs.readFileSync(path.join(getConfigPath(), 'UpdateCheck.json'), 'utf8')
    );
    return settings?.enabled !== false;
  } catch {
    return true;
  }
}

export function setUpdateCheckEnabled(enabled: boolean): void {
  const file = path.join(getConfigPath(), 'UpdateCheck.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ enabled }, null, 2));
}

export function getUpdateCheckStatus(): { enabled: boolean; source: string } {
  const settingDisabled = !readUpdateCheckEnabled();
  const environmentDisabled = isTruthyOptInValue(
    process.env.FRODO_NO_UPDATE_CHECK
  );
  const sources = [
    ...(settingDisabled ? ['setting'] : []),
    ...(environmentDisabled
      ? ['environment variable (FRODO_NO_UPDATE_CHECK)']
      : []),
  ];
  return {
    enabled: !settingDisabled && !environmentDisabled,
    source: sources.length
      ? sources.join(' and ')
      : 'setting (default: enabled)',
  };
}
