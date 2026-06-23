import { readFileSync, writeFileSync } from "fs";

// Runs as the `npm version` lifecycle script: npm has already written the new
// version to package.json and exposes it here. Propagate it to manifest.json
// and versions.json so all three stay in sync.
const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
    console.error("version-bump: npm_package_version is not set. Run via `npm version <patch|minor|major>`.");
    process.exit(1);
}

// Bump manifest.json version, keeping its existing minAppVersion.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

// Map the new plugin version to the minimum Obsidian version in versions.json.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
