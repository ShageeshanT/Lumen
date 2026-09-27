# DigitalOcean

On DigitalOcean your server is a Droplet. Plain Droplets have no firewall, so
ports 80 and 443 usually work straight away.

## Create a VM

**Cheap sizes** (checked 2026-09; confirm on
[DigitalOcean's Droplet pricing](https://www.digitalocean.com/pricing/droplets)):

- **Basic, 2 GB / 1 vCPU / 50 GB**: $12 a month. A good first server.
- **Basic, 1 GB / 1 vCPU / 25 GB**: $6 a month. Lumen's minimum; fine for one
  small app.
- **Basic, 4 GB / 2 vCPU / 80 GB**: $24 a month, for several apps and a
  database.
- DigitalOcean has no free tier. Droplets are billed per second, capped at the
  monthly price.

**Steps:**

1. In the control panel, select **Create**, then **Droplets**.
2. Pick a region and the **Ubuntu 24.04 (LTS) x64** image. Use the plain OS
   image rather than a Marketplace app.
3. Pick a **Basic** plan from the list above and add your SSH key.
4. Select **Create Droplet**.
5. SSH in as `root@<public-ip>` and paste your Lumen join command
   ([Add a server](../add-server.md)).

## Open ports in the cloud firewall

You only need this if a Cloud Firewall is applied to the Droplet:

1. In the control panel, open **Networking**, then **Firewalls**, and select
   the firewall on your Droplet.
2. On the **Rules** tab, add inbound rules of type **HTTP** and **HTTPS**.
3. Keep the sources as **All IPv4** and **All IPv6**, then save each rule.

DigitalOcean's [firewall rules guide](https://docs.digitalocean.com/products/networking/firewalls/how-to/configure-rules/)
has more detail.

## The server's own firewall

Plain Ubuntu Droplets have ufw off. **Marketplace images**, such as the Docker
one, turn ufw on and allow only SSH. The installer detects this and opens 80,
443 and UDP 51820 for you. To do it by hand:

```sh
sudo ufw allow 80,443/tcp
```

## More than one server

If you use a Cloud Firewall, add a **Custom** inbound rule with protocol
**UDP**, port `51820` and your other Droplets (or their public IPs) as sources.

## Attach a domain

Domains arrive in a later version of Lumen. To keep the address stable when you
rebuild or replace a Droplet, assign it a **Reserved IP** (**Networking**, then
**Reserved IPs**). Point an `A` record for your domain at the Droplet's public
IP or its Reserved IP.
