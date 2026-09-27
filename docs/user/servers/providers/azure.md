# Azure

On Azure your server is a virtual machine. Its traffic passes through a network
security group (NSG), which blocks everything you haven't allowed.

## Create a VM

**Free and cheap sizes** (checked 2026-09; confirm in
[Microsoft's free account guide](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/create-free-services)):

- A new free account gets $200 of credit for the first 30 days.
- For 12 months it also includes 750 hours a month each of **B1s**,
  **B2pts v2** (Arm) and **B2ats v2** (AMD) burstable VMs. All three have 1 GB
  of memory, Lumen's minimum.
- Create free VMs from the portal's **Free services** page so the free sizes are
  selected for you.
- For more room, a **B2s** (2 vCPU, 4 GB) is a common paid choice.

**Steps:**

1. In the Azure portal, select **Create a resource**, then **Virtual machine**.
2. Pick **Ubuntu Server 24.04 LTS** and a size from the list above. Use an Arm
   image with B2pts v2 and an x64 image with the others.
3. Choose SSH public key authentication.
4. Under **Inbound port rules**, choose **Allow selected ports** and select
   **HTTP (80)**, **HTTPS (443)** and **SSH (22)**.
5. Select **Review + create**, then **Create**.
6. SSH in as the user you chose and paste your Lumen join command
   ([Add a server](../add-server.md)).

## Open ports in the cloud firewall

If you didn't open HTTP and HTTPS when you created the VM:

1. In the portal, search for **Network security groups** and select the one
   attached to your VM.
2. Open **Settings**, then **Inbound security rules**, and select **Add**.
3. Set **Source** to **Any**, **Protocol** to **TCP**, **Destination port
   ranges** to `80,443` and **Action** to **Allow**.
4. Give it an unused **Priority** between 100 and 4096, such as 310, then
   select **Add**. Lower numbers run first, and Azure's default deny rule sits at
   65500.

If both the VM's network card and its subnet have an NSG, the rule must exist in
both. Microsoft's [NSG guide](https://learn.microsoft.com/en-us/azure/virtual-network/manage-network-security-group)
lists every field.

## The server's own firewall

Azure's Ubuntu images ship with ufw off, so there's usually nothing to do. If
you turned it on yourself, the installer adds its rules for you.

## More than one server

Add an inbound rule with **Source** set to **IP Addresses** and your other
servers' public IPs, **Protocol** **UDP** and **Destination port ranges**
`51820`.

## Attach a domain

Domains arrive in a later version of Lumen. Standard public IPs on Azure are
static, so the address stays the same when the VM restarts. Point an `A` record
for your domain at it. You can also set a free DNS name label on the public IP,
such as `myapp.westeurope.cloudapp.azure.com`.
