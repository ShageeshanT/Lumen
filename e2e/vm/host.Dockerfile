# A stand-in for a fresh Ubuntu 24.04 (or --build-arg BASE=debian:12) cloud VM for Phase 02 host verification:
# systemd as PID 1 and the packages a stock cloud image ships (curl,
# ca-certificates, iptables, sudo). Docker is NOT preinstalled; the agent
# installer installs it from Docker's official repository. Run it privileged
# (it hosts its own Docker Engine), never for anything but tests.
ARG BASE=ubuntu:24.04
FROM ${BASE}

ENV container=docker DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     systemd systemd-sysv dbus iproute2 iptables curl ca-certificates sudo procps kmod gnupg lsb-release \
  && rm -rf /var/lib/apt/lists/* \
  && systemctl mask systemd-logind.service getty.target console-getty.service \
  && systemctl set-default multi-user.target

STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
