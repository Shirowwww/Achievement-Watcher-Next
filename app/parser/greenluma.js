'use strict';

const { appHosts, hostById } = require('../util/appHosts.js');

const KEY_LIST = [
  { keyName: 'GLR', name: 'GreenLuma Reborn' },
  { keyName: 'GL2020', name: 'GreenLuma 2020' },
  { keyName: 'GL2024', name: 'GreenLuma 2024' },
  { keyName: 'GL2025', name: 'GreenLuma 2025' },
];

// GreenLuma keeps its state in HKCU of the host Steam runs in: this machine, or a Wine prefix on Linux.
module.exports.scan = async () => {
  const data = [];
  for (const host of appHosts()) {
    for (const k of KEY_LIST) {
      for (const key of host.regSubkeys('HKCU', `SOFTWARE/${k.keyName}/AppID`)) {
        const glAchEnable = parseInt(host.regValue('HKCU', `SOFTWARE/${k.keyName}/AppID/${key}`, 'SkipStatsAndAchievements'));
        if (glAchEnable !== 0) continue;
        data.push({
          appid: key,
          source: k.name,
          data: {
            type: 'reg',
            root: 'HKCU',
            path: `SOFTWARE/${k.keyName}/AppID/${key}/Achievements`,
            host: host.id,
          },
        });
      }
    }
  }
  return data;
};

module.exports.getAchievements = async (root, key, hostId) => {
  const host = hostById(hostId);
  // An absent key enumerates as an empty array, never null, so length is what says "nothing here".
  const achievements = host.regValueNames(root, key);
  if (achievements.length === 0) throw 'No achievement found in registry';

  const result = [];
  for (const achievement of achievements) {
    if (achievement.endsWith('_Time')) continue;
    result.push({
      id: achievement,
      Achieved: parseInt(host.regValue(root, key, achievement)),
      UnlockTime: parseInt(host.regValue(root, key, achievement + '_Time')),
    });
  }
  return result;
};
