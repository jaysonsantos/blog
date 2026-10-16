{
  description = "Personal blog: Astro static site on Cloudflare Workers";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = [
              # Site: Astro, Biome, and wrangler come from package.json.
              pkgs.nodejs_24
              pkgs.pnpm
              # Hooks of .pre-commit-config.yaml.
              pkgs.prek
              pkgs.typos
              pkgs.shellcheck
              pkgs.nixfmt
              pkgs.editorconfig-checker
              pkgs.gitleaks
              pkgs.actionlint
              pkgs.zizmor
            ];
          };
        }
      );
    };
}
