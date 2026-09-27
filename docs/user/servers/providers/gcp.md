# Google Cloud

On Google Cloud your server is a Compute Engine VM. Google's firewall rules
apply to VMs by network tag, so opening ports means creating a rule and tagging
your VM.

## Create a VM

**Free and cheap sizes** (checked 2026-09; confirm on
[Google Cloud's free features page](https://docs.cloud.google.com/free/docs/free-cloud-features)):

- New customers get a $300 credit to use within 90 days.
- The always-free tier includes one `e2-micro` VM a month in `us-west1`,
  `us-central1` or `us-east1`, with 30 GB of standard persistent disk. It has
  1 GB of memory, which is Lumen's minimum, so keep it for small apps.
- For more room, pick **`e2-small`** (2 GB) or **`e2-medium`** (4 GB), or
  **`t2a-standard-1`** if you want Arm.

**Steps:**

1. In the console, open **Compute Engine**, then **VM instances**, and select
   **Create instance**.
2. Pick a region and machine type from the list above.
3. Under **OS and storage**, change the image to **Ubuntu 24.04 LTS** and set
   the disk to at least 10 GB.
4. Under **Networking**, tick **Allow HTTP traffic** and **Allow HTTPS
   traffic**. On the default network, this opens 80 and 443 for you.
5. Select **Create**, then use **SSH** in the instance list and paste your
   Lumen join command ([Add a server](../add-server.md)).

## Open ports in the cloud firewall

If you didn't tick the HTTP and HTTPS boxes, or you use a custom network, create
a rule in Cloud Shell and tag your VM:

```sh
gcloud compute firewall-rules create lumen-web --allow tcp:80,tcp:443 --target-tags lumen
gcloud compute instances add-tags <instance> --tags lumen --zone <zone>
```

Add `--network <network>` to the first command if your VM isn't on the
`default` network.

To use the console instead, open the **Firewall policies** page, select
**Create firewall rule**, and set:

- **Targets**: Specified target tags, with the tag `lumen`
- **Source IPv4 ranges**: `0.0.0.0/0`
- **Protocols and ports**: TCP `80, 443`

Then edit your VM and add the `lumen` network tag. Google's
[firewall guide](https://docs.cloud.google.com/firewall/docs/using-firewalls)
covers the details.

## The server's own firewall

Google's Ubuntu and Debian images ship with the OS firewall off. If you turned
ufw on yourself, the installer adds its rules for you.

## More than one server

Create a rule that allows **UDP 51820** only from your other servers:

```sh
gcloud compute firewall-rules create lumen-mesh --allow udp:51820 --source-ranges <other-server-ip>/32 --target-tags lumen
```

List every other server's public IP in `--source-ranges`, separated by commas.

## Attach a domain

Domains arrive in a later version of Lumen. To get ready, promote the VM's
external IP to a **static** address (**VPC network**, then **IP addresses**),
so it doesn't change when the VM restarts. Then point an `A` record for your
domain at it.
