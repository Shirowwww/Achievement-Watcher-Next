'use strict';

// On Linux, Smart Find's "drives" are the mount points of real disks, read from /proc/self/mountinfo.

const assert = require('node:assert/strict');
const test = require('node:test');

const listDrive = require('../../app/util/listDrive.js');

const MOUNTINFO = [
  '22 1 0:21 / /proc rw,nosuid,nodev,noexec,relatime shared:12 - proc proc rw',
  '23 1 0:22 / /sys rw,nosuid,nodev,noexec,relatime shared:2 - sysfs sysfs rw',
  '26 1 259:2 /@ / rw,relatime shared:1 - btrfs /dev/nvme0n1p2 rw,ssd,subvol=/@',
  '27 26 259:2 /@home /home rw,relatime shared:30 - btrfs /dev/nvme0n1p2 rw,ssd,subvol=/@home',
  '28 26 259:2 /@snapshots /.snapshots rw,relatime shared:31 - btrfs /dev/nvme0n1p2 rw,subvol=/@snapshots',
  '29 26 259:2 /@log /var/log rw,relatime shared:32 - btrfs /dev/nvme0n1p2 rw,subvol=/@log',
  '30 26 259:1 / /boot/efi rw,relatime shared:33 - vfat /dev/nvme0n1p1 rw,fmask=0022',
  '31 26 0:25 / /run rw,nosuid,nodev shared:5 - tmpfs tmpfs rw,mode=755',
  '32 26 8:1 / /mnt/Jeux\\040SSD rw,relatime shared:40 - ext4 /dev/sda1 rw',
  '33 26 8:17 / /mnt/windows rw,relatime shared:41 - ntfs3 /dev/sdb1 rw,uid=1000',
  '34 31 179:1 / /run/media/deck/SDCARD rw,nosuid,nodev,relatime shared:42 - exfat /dev/mmcblk0p1 rw',
  '35 26 0:50 / /mnt/c rw,noatime - 9p drvfs rw,aname=drvfs;path=C:\\',
  '36 26 0:51 / /mnt/nas rw,relatime - nfs4 nas:/games rw',
  '37 26 8:33 / /media/usb rw,relatime - fuseblk /dev/sdc1 rw,user_id=0',
  '38 26 7:3 / /snap/core22/1612 ro,nodev,relatime - squashfs /dev/loop3 ro',
  '39 26 259:3 / /data rw,relatime - xfs /dev/nvme1n1p1 rw',
  '40 26 8:1 / /mnt/Jeux\\040SSD rw,relatime shared:40 - ext4 /dev/sda1 rw',
  '41 26 259:2 /@ /mnt/wslg/distro rw,relatime - btrfs /dev/nvme0n1p2 rw,subvol=/@',
].join('\n');

test('real disks are kept once; system, virtual, network, WSL and bind mounts are not', () => {
  assert.deepEqual(listDrive.linuxMountRoots(MOUNTINFO), [
    '/',
    '/home',
    '/mnt/Jeux SSD',
    '/mnt/windows',
    '/run/media/deck/SDCARD',
    '/media/usb',
    '/data',
  ]);
});

test('ignoreSystemDrive leaves out the root filesystem only', () => {
  assert.deepEqual(listDrive.linuxMountRoots(MOUNTINFO, { ignoreSystemDrive: true }).slice(0, 2), ['/home', '/mnt/Jeux SSD']);
});

test('an unreadable or empty mount table lists nothing', () => {
  assert.deepEqual(listDrive.linuxMountRoots(''), []);
  assert.deepEqual(listDrive.linuxMountRoots(undefined), []);
});

test('this machine lists its root filesystem', { skip: process.platform !== 'linux' && 'Linux-only' }, async () => {
  const roots = await listDrive({ ignoreSystemDrive: false });
  assert.ok(roots.includes('/'), `mounts: ${roots.join(', ')}`);
  assert.ok(roots.every((root) => root.startsWith('/')));
});
