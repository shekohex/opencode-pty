{
  description = "Bun devShell with bun2nix JS dependencies";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        browsers =
          (builtins.fromJSON (builtins.readFile "${pkgs.playwright-driver}/browsers.json")).browsers;
        chromium-rev = (builtins.head (builtins.filter (x: x.name == "chromium") browsers)).revision;
        firefox-rev = (builtins.head (builtins.filter (x: x.name == "firefox") browsers)).revision;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.bashInteractive
            pkgs.playwright-driver.browsers
          ];
          shellHook = ''
            export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
            export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${pkgs.playwright-driver.browsers}/chromium-${chromium-rev}/chrome-linux64/chrome";
            export PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH="${pkgs.playwright-driver.browsers}/firefox-${firefox-rev}/firefox/firefox";
          '';
        };
      }
    );

}
