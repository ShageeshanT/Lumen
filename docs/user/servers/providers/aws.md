# AWS

On AWS your server is an EC2 instance. AWS blocks ports 80 and 443 in the
instance's security group until you open them.

## Create a VM

**Free and cheap sizes** (checked 2026-09; confirm on the
[EC2 Free Tier page](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html)):

- Accounts created on or after 15 July 2025 get a Free plan: $100 in credit at
  sign-up, up to $100 more for trying a few services, lasting 6 months or until
  the credit runs out.
- Free-tier eligible types on that plan are `t3.micro`, `t3.small`,
  `t4g.micro`, `t4g.small`, `c7i-flex.large` and `m7i-flex.large`.
- Pick **`t4g.small`** (Arm, 2 vCPU, 2 GB) or **`t3.small`** (x86, 2 vCPU,
  2 GB). The `micro` sizes have 1 GB, Lumen's minimum.
- Older accounts keep the 12-month free tier with `t2.micro` or `t3.micro`.
- AWS charges a small hourly fee for each public IPv4 address, even on the free
  plan's credit.

**Steps:**

1. In the EC2 console, select **Launch instance**.
2. Pick **Ubuntu Server 24.04 LTS** and the architecture that matches your
   instance type (64-bit Arm for `t4g`, 64-bit x86 for `t3`).
3. Choose the instance type and your key pair.
4. Under **Network settings**, keep **Auto-assign public IP** on and tick
   **Allow HTTPS traffic from the internet** and **Allow HTTP traffic from the
   internet**. This saves you the firewall step below.
5. Give it at least 10 GB of storage, then select **Launch instance**.
6. SSH in as `ubuntu@<public-ip>` and paste your Lumen join command
   ([Add a server](../add-server.md)).

## Open ports in the cloud firewall

If you didn't tick the HTTP and HTTPS boxes at launch:

1. In the EC2 console, open **Instances**, select your server and open the
   **Security** tab.
2. Select the security group listed there, then choose **Edit inbound rules**.
3. Add rules of type **HTTP** and **HTTPS**, each with source `0.0.0.0/0`, and
   the same two with source `::/0` for IPv6.
4. Choose **Save rules**.

AWS's [security group guide](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/working-with-security-groups.html)
has screenshots.

## The server's own firewall

Ubuntu and Amazon Linux images on AWS ship with the OS firewall off, so there's
usually nothing to do. If you turned ufw on yourself, the installer adds its
rules for you. To check:

```sh
sudo ufw status
```

## More than one server

Add a **Custom UDP** inbound rule for port **51820** with each of your other
servers' public IPs as the source (`<ip>/32`). Do the same on every server.

## Attach a domain

Domains arrive in a later version of Lumen. To get ready, allocate an **Elastic
IP** and associate it with your instance, so the address stays the same when the
instance stops. Then point an `A` record for your domain at it.
