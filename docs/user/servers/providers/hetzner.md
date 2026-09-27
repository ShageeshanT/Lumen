# Hetzner

Hetzner Cloud servers are simple and inexpensive. New servers have no firewall
at all, so ports 80 and 443 usually work straight away.

## Create a VM

**Cheap sizes** (checked 2026-09, after Hetzner's 15 June 2026 price change;
confirm on [Hetzner's price adjustment page](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)):

- **CX23**: 2 vCPU (x86), 4 GB, 40 GB disk, €5.49 a month in Germany and Finland.
- **CAX11**: 2 vCPU (Arm), 4 GB, 40 GB disk, €5.99 a month in Germany and
  Finland.
- Hetzner has no free tier. Prices exclude VAT, and the cheapest plans are
  sometimes sold out in a location. If they are, pick the next plan that's
  available.

**Steps:**

1. In the Hetzner Console, open your project and select **Add server**.
2. Pick a location, then the **Ubuntu 24.04** image.
3. Pick a type from the list above and add your SSH key.
4. Leave **Firewalls** empty for now, then select **Create & Buy now**.
5. SSH in as `root@<public-ip>` and paste your Lumen join command
   ([Add a server](../add-server.md)).

## Open ports in the cloud firewall

You only need this if you attached a Hetzner Cloud Firewall. A firewall drops
all inbound traffic you haven't listed, so add:

1. In the Hetzner Console, open **Firewalls** and select the firewall applied to
   your server.
2. Under **Inbound rules**, add a **TCP** rule for port `80` and another for
   `443`, each with the sources **Any IPv4** and **Any IPv6**.
3. Save the rules. Hetzner applies them within a few seconds.

Keep your SSH rule (TCP 22) in place. Hetzner's
[firewall guide](https://docs.hetzner.com/cloud/firewalls/getting-started/creating-a-firewall/)
has more detail.

## The server's own firewall

Hetzner's standard images ship without an OS firewall. If you turned ufw on
yourself, the installer adds its rules for you.

## More than one server

If you use a Cloud Firewall, add a **UDP** rule for port `51820` whose sources
are your other servers' public IPs. You can also connect Hetzner servers with a
Hetzner private network; Lumen's mesh works over either.

## Attach a domain

Domains arrive in a later version of Lumen. A server's primary IP stays the same
for as long as the server exists. To keep an address when you replace a server,
use a **Primary IP** you create separately and assign it. Point an `A` record
for your domain at it, and an `AAAA` record at the IPv6 address if you use one.
