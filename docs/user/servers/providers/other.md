# Other providers and your own hardware

Lumen works on any Linux machine that meets the
[requirements](../add-server.md#before-you-start): a VM from another provider, a
dedicated server, or a machine at home or in an office.

## Create a VM

Pick **Ubuntu 24.04**, Ubuntu 22.04 or Debian 12 on amd64 or arm64, with at least
1 GB of memory and 10 GB of disk. Most small plans from any provider are enough
for a first app. Make sure the machine has a public IPv4 address if you want to
serve apps from it.

Then SSH in and paste your Lumen join command ([Add a server](../add-server.md)).

## Open ports in the cloud firewall

Many providers have a firewall in their dashboard, often called a firewall,
security group or network rules. If yours does:

1. Find the firewall that applies to this server.
2. Add inbound rules that allow TCP `80` and `443` from anywhere: `0.0.0.0/0`
   for IPv4 and `::/0` for IPv6.
3. Save the rules, wait a minute, then select **Recheck** in Lumen.

## The server's own firewall

The installer detects ufw, firewalld and plain iptables and opens `80/tcp`,
`443/tcp` and `51820/udp` in whichever one is active. If you manage the firewall
yourself, these are the equivalent commands:

```sh
# ufw
sudo ufw allow 80,443/tcp

# firewalld
sudo firewall-cmd --permanent --add-port=80/tcp --add-port=443/tcp && sudo firewall-cmd --reload

# iptables (then save, for example with netfilter-persistent)
sudo iptables -I INPUT 1 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 1 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## Machines at home or behind a router

A machine on a home or office network sits behind your router's public IP.

- Forward TCP `80` and `443` on the router to the machine's local IP. Only one
  machine behind that IP can own these ports.
- Some internet providers use carrier-grade NAT, where you don't get a public
  IP of your own. Port forwarding can't work there; ask your provider for a
  public IP or use a VM for public apps.
- The agent only dials out, so it connects to Lumen without any forwarding. Only
  your apps need 80 and 443.

## More than one server

Allow **UDP 51820** between your servers, with each other server's public IP as
the source. Don't open 51820 to everyone.

## Attach a domain

Domains arrive in a later version of Lumen. To get ready, make sure the
server's public IP won't change: ask your provider for a static or reserved IP.
Then point an `A` record for your domain at it, and an `AAAA` record if you
use IPv6.
