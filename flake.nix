{
  description = "UVACompute CLI - GPU cloud computing for students";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      version = "0.0.50";

      supportedSystems = [ "x86_64-linux" "aarch64-darwin" ];

      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;

      assets = {
        x86_64-linux = {
          asset = "uvacompute-linux";
          hash = "sha256-uXqoOYXd2W4hJmHWaADoJfhzEf4QuKcILmDg4CuKiew=";
        };
        aarch64-darwin = {
          asset = "uvacompute-macos";
          hash = "sha256-N5SJMo4rHbcpEP5tFNEK5WLWjjUYWc/Psnhxf3Jklak=";
        };
      };

      manPageHash = "sha256-2K0ryGYL/xDtYnFY+47ty/7A30uoO2pUM1rBW8Z45gs=";
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          asset = assets.${system};

          binary = pkgs.fetchurl {
            url = "https://github.com/charliemeyer2000/uvacompute/releases/download/cli-v${version}/${asset.asset}";
            hash = asset.hash;
          };

          manPage = pkgs.fetchurl {
            url = "https://github.com/charliemeyer2000/uvacompute/releases/download/cli-v${version}/uva.1";
            hash = manPageHash;
          };
        in
        {
          default = pkgs.stdenvNoCC.mkDerivation {
            pname = "uvacompute";
            inherit version;

            dontUnpack = true;

            dontAutoPatchelf = true;

            nativeBuildInputs = nixpkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
              pkgs.patchelf
            ];

            installPhase = ''
              runHook preInstall
              install -Dm755 ${binary} $out/bin/uva
              install -Dm644 ${manPage} $out/share/man/man1/uva.1
              runHook postInstall
            '';

            postFixup = nixpkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux ''
              patchelf --set-interpreter "$(cat ${pkgs.stdenv.cc}/nix-support/dynamic-linker)" $out/bin/uva
            '';

            meta = with pkgs.lib; {
              description = "CLI for UVACompute GPU cloud computing";
              homepage = "https://uvacompute.com";
              platforms = supportedSystems;
              mainProgram = "uva";
            };
          };
        }
      );

      overlays.default = final: prev: {
        uvacompute = self.packages.${prev.system}.default;
      };
    };
}
