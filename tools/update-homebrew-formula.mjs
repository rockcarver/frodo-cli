#!/usr/bin/env node
/**
 * Generates the Homebrew formula bodies for frodo-cli / frodo-cli-next
 * (rockcarver/homebrew-frodo-cli tap) as per-OS/arch prebuilt-binary
 * installs: the formula downloads the release zips the pipeline built,
 * tested, signed and notarized, so Homebrew users run the exact tested
 * artifact instead of a second, locally-built binary (which also
 * required node@24 at install time).
 *
 * Usage:
 *   node tools/update-homebrew-formula.mjs <version> <tag> [outdir]
 *   e.g. node tools/update-homebrew-formula.mjs 4.18.0 v4.18.0 /tmp/tap
 *
 * Writes <outdir>/frodo-cli.rb and <outdir>/frodo-cli-next.rb. Release
 * zips are fetched to compute sha256 (set GITHUB_TOKEN to avoid API rate
 * limits); the fetched bytes are exactly what `brew install` downloads,
 * so the pinned hash is verified twice - here and by brew.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [version, tag, outArg] = process.argv.slice(2);
if (!version || !tag) {
  console.error('usage: node tools/update-homebrew-formula.mjs <version> <tag> [outdir]');
  process.exit(2);
}
const outDir = outArg || mkdtempSync(join(tmpdir(), 'frodo-formula-'));
mkdirSync(outDir, { recursive: true });

const RELEASE_BASE = `https://github.com/rockcarver/frodo-cli/releases/download/${tag}`;

// Release zip asset -> (brew OS block, brew arch predicate). Each zip
// contains a single signed/notarized `frodo` binary at its root.
const TARGETS = [
  { asset: `frodo-macos-arm64-${version}.zip`, cond: 'on_macos', arch: 'arm64' },
  { asset: `frodo-macos-intel-${version}.zip`, cond: 'on_macos', arch: 'intel' },
  { asset: `frodo-linux-arm64-${version}.zip`, cond: 'on_linux', arch: 'arm64' },
  { asset: `frodo-linux-x64-${version}.zip`, cond: 'on_linux', arch: 'x86_64' },
];

async function sha256OfZip(url) {
  const headers = {};
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
  const hash = createHash('sha256');
  for await (const chunk of res.body) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * Install-time collision guard, kept from the source-build formulas:
 * stable refuses to clobber an installed pre-release of frodo-cli-next
 * and vice versa - both formulas install a binary named `frodo`.
 */
function guardBlock(which) {
  if (which === 'stable') {
    return `  def pre_install_guard
    if File.exist?("#{HOMEBREW_PREFIX}/bin/frodo") &&
       \`#{HOMEBREW_PREFIX}/bin/frodo -v\` =~ CLI_PRERELEASE_LINE
      odie "frodo-cli next/latest/unstable pre-release already installed, run 'brew uninstall frodo-cli-next' first and then re-install this."
    end
  end
`;
  }
  return `  def pre_install_guard
    if File.exist?("#{HOMEBREW_PREFIX}/bin/frodo") &&
       !(\`#{HOMEBREW_PREFIX}/bin/frodo -v\` =~ CLI_PRERELEASE_LINE)
      odie "frodo-cli STABLE already installed, run 'brew uninstall frodo-cli' first and then re-install this."
    end
  end
`;
}

function formulaBody(which, urlBlocks) {
  const className = which === 'stable' ? 'FrodoCli' : 'FrodoCliNext';
  return `class ${className} < Formula
  desc "Command-line interface to manage ForgeRock Identity Cloud"
  homepage "https://github.com/rockcarver/frodo-cli#readme"
  version "${version}"
  license "MIT"

  livecheck do
    url :stable
    regex(/^v?(\\d+(?:\\.\\d+)+)$/i)
  end

  # Matches the "cli:" line of \`frodo -v\`, e.g. "cli: v4.16.0 (2026-09-30T00:10:51.195Z)".
  # Any number of digits per component, so 4.10.0 / 10.0.0 / 4.16.12 all match.
  CLI_VERSION_LINE = /^cli: v\\d+\\.\\d+\\.\\d+/
  # Pre-release builds carry a "-suffix" directly on the version (e.g. v4.16.1-3).
  # Must not look past the version token: the build timestamp contains dashes too.
  CLI_PRERELEASE_LINE = /^cli: v\\d+\\.\\d+\\.\\d+-\\S+/

${urlBlocks}
${guardBlock(which)}
  def install
    pre_install_guard
    # The pipeline builds, tests, signs and notarizes the binary in the
    # release zip - install exactly that artifact instead of building a
    # second, untested binary from source on the user's machine.
    bin.install "frodo"
  end

  test do
    output = shell_output("#{bin}/frodo -v")
    assert_match CLI_VERSION_LINE, output
    shell_output("#{bin}/frodo -h 2>/dev/null")
  end
end
`;
}

async function urlBlocks() {
  const blocks = await Promise.all(
    TARGETS.map(async (t) => {
      const url = `${RELEASE_BASE}/${t.asset}`;
      const sha = await sha256OfZip(url);
      return `  ${t.cond} do
    if Hardware::CPU.${t.arch}?
      url "${url}"
      sha256 "${sha}"
    end
  end`;
    }),
  );
  return blocks.join('\n\n');
}

const main = async () => {
  const blocks = await urlBlocks();
  const prerelease = /-/.test(version);
  // The stable formula tracks stable releases only (the pipeline gates it on
  // !preRelease); frodo-cli-next tracks every release, prereleases included.
  const which = prerelease ? ['next'] : ['stable', 'next'];
  for (const w of which) {
    const file = join(outDir, `frodo-cli${w === 'next' ? '-next' : ''}.rb`);
    writeFileSync(file, formulaBody(w, blocks));
    console.log(`wrote ${file}`);
  }
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
