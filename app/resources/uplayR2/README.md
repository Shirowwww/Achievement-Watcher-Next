# Goldberg Uplay R2 loaders

The four x86/x64 Uplay and UPC loader aliases are stored here as plain DLLs so the integrated repair
does not need to unpack them during normal use. `GoldbergUplayR2-11-07-2026.7z` is the recovery copy
used when a loose resource has been removed, for example by antivirus software.

- Recovery archive SHA-256: `655edfd05ab61c87b35dd24d9e96e2f4263672f9a6651014e52a2b0649155c34`
- x86 DLL SHA-256: `01c016c11b029f4e029018074233ae0c695cddbdf3b719ff4e60dfd14509c131`
- x64 DLL SHA-256: `fb93763842016cfa992f5f17f96209213c943248e0f00b9bbc2edeb0f83e7105`

The aliases are byte-identical within each architecture. Custom DLL imports are not restricted to
these hashes; AW Next validates their PE architecture and achievement capability instead.

Confirm redistribution terms before publishing an installer.
