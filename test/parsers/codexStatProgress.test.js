'use strict';

// A CODEX/RUNE save keeps stats in stats.ini under [UserStats], with dashed names, and ships no
// steam_settings: progress has to map through the Steam client's schema, cached in AW's own folder.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const steam = require('../../app/parser/steam.js');
const { applyLocalStatProgress, resolveProgressSchema } = require('../../app/parser/statProgress.js');

function cstr(s) {
  return Buffer.concat([Buffer.from(String(s), 'utf8'), Buffer.from([0])]);
}
function kvNode(key, ...children) {
  return Buffer.concat([Buffer.from([0x00]), cstr(key), ...children, Buffer.from([0x08])]);
}
function kvStr(key, val) {
  return Buffer.concat([Buffer.from([0x01]), cstr(key), cstr(val)]);
}
function kvInt(key, val) {
  const b = Buffer.alloc(4);
  b.writeInt32LE(val);
  return Buffer.concat([Buffer.from([0x02]), cstr(key), b]);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-codex-progress-'));
  try {
    const appid = '1659420';
    const save = path.join(tmp, 'CODEX', appid);
    const statsDir = path.join(tmp, 'Steam', 'appcache', 'stats');
    const userData = path.join(tmp, 'userData');
    fs.mkdirSync(save, { recursive: true });
    fs.mkdirSync(statsDir, { recursive: true });

    fs.writeFileSync(
      path.join(save, 'achievements.ini'),
      ['[SteamAchievements]', '00000=TROPHY_HEADSHOT_HIGH', 'Count=1', '', '[TROPHY_HEADSHOT_HIGH]', 'Achieved=0', 'CurProgress=0', 'MaxProgress=0', 'UnlockTime=0'].join('\r\n')
    );
    fs.writeFileSync(path.join(save, 'stats.ini'), ['[UserStats]', 'kill-headshot=149', 'pick-up-treasure=23'].join('\r\n'));

    fs.writeFileSync(
      path.join(statsDir, `UserGameStatsSchema_${appid}.bin`),
      kvNode(
        appid,
        kvNode(
          'stats',
          kvNode(
            '1',
            kvStr('type', '4'),
            kvNode(
              'bits',
              kvNode(
                '0',
                kvStr('name', 'TROPHY_HEADSHOT_HIGH'),
                kvNode('progress', kvNode('value', kvStr('operation', 'statvalue'), kvStr('operand1', 'kill-headshot')), kvInt('max_val', 250))
              )
            )
          ),
          kvNode('2', kvStr('type', '1'), kvStr('name', 'kill-headshot'))
        )
      )
    );

    const root = await steam.getAchievementsFromFile(save);
    assert.ok(Array.isArray(root.__rawStatKeys) && root.__rawStatKeys.includes('kill-headshot'), 'dashed [UserStats] keys are read');

    const schema = resolveProgressSchema({ appid, localSchema: [], steamStatsDir: statsDir, cacheDir: userData });
    assert.equal(applyLocalStatProgress(root, schema), 1);
    assert.equal(root.TROPHY_HEADSHOT_HIGH.CurProgress, 149);
    assert.equal(root.TROPHY_HEADSHOT_HIGH.MaxProgress, 250);
    console.log('PASS: CODEX [UserStats] progress maps through the Steam client schema');

    const cached = path.join(userData, 'steam_cache', 'progress', `${appid}.json`);
    assert.ok(fs.existsSync(cached), 'the table is kept in the cache');
    assert.ok(!fs.existsSync(path.join(save, 'steam_settings')), 'nothing is written beside the save');
    fs.rmSync(statsDir, { recursive: true, force: true });
    const fromCache = resolveProgressSchema({ appid, localSchema: [], steamStatsDir: statsDir, cacheDir: userData });
    assert.equal(fromCache[0].progress.value.operand1, 'kill-headshot');
    console.log('PASS: the cached table survives the Steam client dropping its schema');

    const gbe = path.join(tmp, 'gbe', 'steam_settings');
    fs.mkdirSync(gbe, { recursive: true });
    fs.writeFileSync(
      path.join(gbe, 'achievements.json'),
      JSON.stringify([{ name: 'ACH_X', displayName: 'X', progress: { min_val: 0, max_val: 50, value: { operation: 'statvalue', operand1: 'stat_x' } } }])
    );
    const local = steam.getLocalAchievementSchema(path.join(tmp, 'gbe'), '480');
    assert.equal(local[0].max_progress, 50);
    console.log('PASS: a GBE schema max comes from max_val');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
