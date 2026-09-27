# Add a server

A server is a VM you already own. You connect it to Lumen once, and from then on
Lumen can run your apps on it. It takes one command and usually about three
minutes.

## Before you start

You need a fresh VM with:

| | Minimum | Recommended |
|---|---|---|
| Operating system | Ubuntu 22.04, Ubuntu 24.04 or Debian 12 | Ubuntu 24.04 |
| CPU architecture | amd64 (x86_64) or arm64 (aarch64) | Either |
| CPU | 1 vCPU | 2 vCPU |
| Memory | 1 GB | 2 GB or more |
| Free disk on `/var/lib` | 2 GB | 10 GB or more |

You also need to be able to run commands as root on it, usually over SSH with
`sudo`. RHEL-family 9 systems (Rocky, AlmaLinux, RHEL) work too, with less
testing. On any other system the installer stops before it changes anything.

Not sure which provider or size to pick? Each provider has a short guide:
[Oracle Cloud](providers/oracle.md) · [AWS](providers/aws.md) ·
[Google Cloud](providers/gcp.md) · [Azure](providers/azure.md) ·
[Hetzner](providers/hetzner.md) · [DigitalOcean](providers/digitalocean.md) ·
[Anything else](providers/other.md).

## 1. Create a join command

In Lumen, open **Servers** and select **Connect server**. Give the server a name
you'll recognise, such as `oracle-1`, and pick its provider. Lumen shows a
command like this one:

```sh
curl -fsSL https://<control-plane>/install/agent.sh | sudo sh -s -- --token <join-token> --control-plane https://<control-plane>
```

`<control-plane>` is the address of your Lumen install. `<join-token>` is a
one-time token Lumen created for this server.

- A join token works **once** and expires after **1 hour**. If it expires, create
  a new command; nothing else needs to change.
- Treat the command like a password until you've used it. Anyone with it can
  connect a machine to your workspace during that hour.

## 2. Paste it into your VM

SSH into the VM and paste the command. The installer explains each step as it
goes, for example "Installing Docker (about a minute)…". When it finishes you
see:

```
✔ Connected · ✔ Docker · ✔ Proxy
This server is online. Go back to your browser.
```

It's safe to run the command again. Every step checks what's already done and
skips it, so a second run on a working server changes nothing. If the server is
already connected, the installer says "Already joined as <name>" and moves on.

## 3. Watch the checklist

Back in Lumen, the server shows a checklist that fills in live:

| Item | What it means |
|---|---|
| **Connected** | The Lumen agent on the server has dialled out to Lumen and checks in every few seconds. |
| **Docker ready** | Docker is installed and running, so the server can build and run your apps. |
| **Proxy running** | The built-in web proxy is running. It handles HTTPS certificates and sends traffic to your apps. |
| **Port 80 reachable** | Lumen reached port 80 on the server's public IP from the internet. Certificates need it. |
| **Port 443 reachable** | Lumen reached port 443 (HTTPS) from the internet. Visitors use this one. |
| **Mesh ready** | Your servers can reach each other privately over UDP 51820. With one server this shows **Not needed yet**. |

If a port check fails, the server shows a fix card with the exact steps for your
provider, such as "Open port 443 in Oracle Cloud's security list". Most providers
block ports 80 and 443 in their own firewall until you open them. After you
change the rule, select **Recheck**; the result is usually back within seconds.

If the control plane runs on this same server, Lumen can't always test the ports
from outside. In that case it tells you so; open your app's URL in a browser to
confirm.

## What the installer changes

The installer only touches what it needs, and logs every step to
`/var/log/lumen-agent-install.log`.

- **Docker Engine** from Docker's official package repository, unless a working
  Docker 24 or newer is already installed.
- **OS firewall rules** that allow `80/tcp`, `443/tcp` and `51820/udp`. It uses
  whichever firewall is active: ufw, firewalld or plain iptables. On images that
  reject new ports with an iptables rule (Oracle's Ubuntu image does), it adds
  the accept rules before that rule and saves them so they survive a reboot.
- **The agent binary** at `/usr/local/bin/lumen-agent`. The installer checks its
  checksum and signature first and refuses to install a file that doesn't match.
- **Agent data** in `/var/lib/lumen` and **settings** in `/etc/lumen/agent.env`,
  both readable by root only.
- **A systemd service** called `lumen-agent` that starts on boot and restarts if
  it stops.

It doesn't change your cloud provider's firewall. It prints the steps for that
instead, because only you can change it.

## How the agent connects

The agent only dials out. It opens one encrypted connection from the server to
Lumen and keeps it open. There's no inbound management port to protect, and
nothing on the server listens for Lumen.

The only ports open to the internet are 80 and 443 for your apps, and UDP 51820
for the private network between your servers. The proxy's admin interface
listens on `127.0.0.1:2019`, so only the server itself can reach it.

Your apps keep running if the connection drops. Only the dashboard loses contact
until the agent reconnects.

## Remove a server

1. Move or delete any services on the server first.
2. On the server, run:

   ```sh
   sudo lumen-agent uninstall
   ```

   This stops and removes the agent, its service and Lumen's containers and data.
   To keep your volumes and data on disk, add `--keep-data`:

   ```sh
   sudo lumen-agent uninstall --keep-data
   ```

3. In Lumen, open the server's settings and select **Remove server**.

Docker stays installed. The firewall rules for 80, 443 and 51820 stay too;
remove them yourself if you no longer need them.

## Troubleshooting

### The server shows offline

The agent hasn't checked in. Check that the VM is running and can reach the
internet, then look at the agent's service:

```sh
sudo systemctl status lumen-agent
journalctl -u lumen-agent -o cat
```

`journalctl -u lumen-agent -o cat` prints the agent's own messages, which say
what it's waiting for. If you can't tell what's wrong, run the join command
again. It's safe and repairs a broken install.

### The installer warns that the clock isn't synced

The agent's connection uses short-lived credentials, so a clock that's minutes
off can stop it connecting. Turn on time sync:

```sh
sudo timedatectl set-ntp true
timedatectl status
```

Look for `System clock synchronized: yes`, then run the join command again.

### Docker ready stays unchecked

Docker is installed but not responding. Restart it and watch the checklist:

```sh
sudo systemctl restart docker
sudo systemctl status docker
```

If Docker still won't start, `journalctl -u docker -o cat` shows why. A full disk
is the most common cause.

### The installer stops with a disk space message

The installer needs at least 2 GB free on `/var/lib`. Remove old files or
images, or resize the disk in your provider's console, then run the command
again. Check free space with `df -h /var/lib`.

### Port 80 or 443 isn't reachable

Follow the fix card in Lumen. It covers both your provider's firewall and the
server's own firewall. Your provider's guide has the same steps with more
detail.

### Two servers share one public IP

Servers behind the same NAT or router share one public IP, and only one of them
can receive traffic on ports 80 and 443. Lumen shows the port check as
reachable on one and failed on the other. Give each server its own public IP,
or run your public apps on the one that owns the ports and use the others for
workers and databases.

### Log files

- Installer: `/var/log/lumen-agent-install.log`
- Agent: `journalctl -u lumen-agent -o cat`
