#!/usr/bin/env bun

import { $ } from "bun";
import { mkdirSync, existsSync } from "fs";

const targets = [
  { platform: "darwin", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
  { platform: "linux", arch: "x64" },
];

async function build() {
  // Ensure dist directory exists
  if (!existsSync("dist")) {
    mkdirSync("dist");
  }

  console.log("Building pty-skill CLI binaries...\n");

  for (const { platform, arch } of targets) {
    const outName = `pty-skill-${platform}-${arch}`;
    const target = `bun-${platform}-${arch}`;

    console.log(`Building ${outName}...`);

    try {
      await $`bun build --compile --target=${target} cli/bin/pty-skill.ts --outfile dist/${outName}`.quiet();
      console.log(`  ✓ dist/${outName}`);
    } catch (e) {
      console.error(`  ✗ Failed to build ${outName}`);
      console.error(`    ${e}`);
    }
  }

  console.log("\nBuild complete!");
}

build().catch(console.error);
