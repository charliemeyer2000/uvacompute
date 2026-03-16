# getting started

uvacompute provides instant access to gpu-powered virtual machines and container jobs. follow these steps to get up and running.

## 1. install the cli

run this command in your terminal to install the uva cli:

```bash
curl -fsSL https://uvacompute.com/install.sh | bash
```

### alternative: install with nix

if you use [nix](https://nixos.org), you can install the cli from the flake:

```bash
# run directly
nix run 'https://uvacompute.com/nix/flake.tar.gz'

# install to your profile
nix profile install 'https://uvacompute.com/nix/flake.tar.gz'
```

or add it to your flake inputs:

```nix
{
  inputs.uvacompute.url = "https://uvacompute.com/nix/flake.tar.gz";

  # use the package
  # inputs.uvacompute.packages.${system}.default

  # or use the overlay
  # inputs.uvacompute.overlays.default
}
```

## 2. create an account

sign up for uvacompute if you haven't already:

visit [uvacompute.com/signup](https://uvacompute.com/signup)

## 3. authenticate your cli

link your cli to your account:

```bash
uva login
```

this will open a browser window for authentication.

## what's next?

- [virtual machines](./vms.md) - create and manage gpu-powered vms
- [container jobs](./jobs.md) - run docker containers on demand
- [node management](./nodes.md) - contribute your hardware to the network
- [configuration](./configuration.md) - configuration file locations and reference
