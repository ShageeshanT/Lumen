# Oracle Cloud

Oracle Cloud has a generous free tier, and its Arm VMs run Lumen well. It also
blocks new ports in two places, so plan on a few extra minutes the first time.

## Create a VM

**Free and cheap sizes** (checked 2026-09; Oracle changes these, so confirm on
[Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)):

- **Ampere A1 (Arm, `VM.Standard.A1.Flex`)**: Always Free tenancies get 1,500
  OCPU hours and 9,000 GB hours a month, which is one VM with 2 OCPUs and 12 GB
  of memory running all month. This is the one to pick. Pay As You Go accounts
  have reported a larger free allowance; check your tenancy's limits.
- **AMD micro (`VM.Standard.E2.1.Micro`)**: up to two, each with 1 GB of memory.
  That's Lumen's minimum, so use it only for small apps.
- Always Free VMs must be in your **home region**, and boot and block volumes
  share 200 GB in total.

Popular regions often report "Out of capacity" for Ampere A1. Try another
availability domain, or try again later.

**Steps:**

1. In the Oracle Cloud console, open **Compute**, then **Instances**, and select
   **Create instance**.
2. Under **Image and shape**, pick **Canonical Ubuntu 24.04** and the
   `VM.Standard.A1.Flex` shape with 2 OCPUs and 12 GB of memory.
3. Under **Networking**, keep **Assign a public IPv4 address** on.
4. Add your SSH public key, then select **Create**.
5. When it's running, SSH in as `ubuntu@<public-ip>` and paste your Lumen join
   command ([Add a server](../add-server.md)).

## Open ports in the cloud firewall

Oracle's default security list only allows SSH. Open 80 and 443 there:

1. Open **Networking**, then **Virtual cloud networks**, and select the VCN your
   server uses.
2. Open the subnet your server is in and select its security list, usually
   **Default Security List**.
3. Select **Add Ingress Rules**. Set **Source CIDR** to `0.0.0.0/0` and
   **IP Protocol** to **TCP**.
4. Set **Destination Port Range** to `80`, select **Another ingress rule**, add
   the same rule for `443`, then select **Add Ingress Rules**.

If your server's network card uses a **network security group**, add the same
two rules there as well. Traffic has to be allowed by both.

See Oracle's [security list documentation](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm)
if the console looks different.

## The server's own firewall

Oracle's Ubuntu image ends its iptables `INPUT` chain with a catch-all rule:

```
-A INPUT -j REJECT --reject-with icmp-host-prohibited
```

Anything not allowed above that line is refused, even after you open the
security list. Lumen's installer inserts accept rules for 80, 443 and UDP 51820
above it and saves them, so you normally don't need to do anything. To do it by
hand:

```sh
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Don't use ufw on this image. Oracle's rules live in iptables directly, and
turning ufw on can lock you out of SSH.

On Oracle Linux images the firewall is firewalld instead:

```sh
sudo firewall-cmd --permanent --add-port=80/tcp --add-port=443/tcp && sudo firewall-cmd --reload
```

## More than one server

For the private network between servers, add an ingress rule for **UDP 51820**
whose source is each of your other servers' public IPs as `<ip>/32`. Don't open
51820 to `0.0.0.0/0`.

## Attach a domain

Domains arrive in a later version of Lumen. To get ready, reserve the public IP
so it survives a restart: on the instance's **Attached VNICs**, edit the primary
IP and switch it to a **reserved public IP**. Then point an `A` record for your
domain at that IP with your DNS provider.
