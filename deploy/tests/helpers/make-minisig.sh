#!/bin/sh
# Create minisign-compatible keys and signatures with openssl, for tests.
#
#   make-minisig.sh keygen <keydir>
#       Writes <keydir>/sk.pem, pk.raw, keyid.raw and minisign.pub, and prints
#       the public key line (base64 of "Ed" || key_id[8] || ed25519_pk[32]).
#
#   make-minisig.sh sign <keydir> <file> [--legacy] [trusted comment]
#       Writes <file>.minisig. Default is the prehashed "ED" algorithm
#       (Ed25519 over BLAKE2b-512 of the file); --legacy signs the file itself
#       ("Ed"). The global signature covers sig[64] || trusted comment.
#
# Format reference: https://jedisct1.github.io/minisign/ (signature format).
set -eu

b64() {
  openssl base64 -A
}

cmd=${1:?usage: make-minisig.sh keygen|sign ...}
case $cmd in
  keygen)
    dir=${2:?keydir}
    mkdir -p "$dir"
    openssl genpkey -algorithm ed25519 -out "$dir/sk.pem" 2>/dev/null
    openssl pkey -in "$dir/sk.pem" -pubout -outform DER | tail -c 32 >"$dir/pk.raw"
    head -c 8 /dev/urandom >"$dir/keyid.raw"
    pub=$({ printf 'Ed'; cat "$dir/keyid.raw" "$dir/pk.raw"; } | b64)
    keyid_hex=$(od -An -tx1 "$dir/keyid.raw" | tr -d ' \n')
    printf 'untrusted comment: minisign public key %s\n%s\n' "$keyid_hex" "$pub" >"$dir/minisign.pub"
    printf '%s\n' "$pub"
    ;;
  sign)
    dir=${2:?keydir}
    file=${3:?file}
    alg=ED
    if [ "${4:-}" = "--legacy" ]; then
      alg=Ed
      shift
    fi
    tc=${4:-"timestamp:1767225600	file:${file##*/}	hashed"}
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    if [ "$alg" = ED ]; then
      openssl dgst -blake2b512 -binary "$file" >"$tmp/msg"
    else
      cp "$file" "$tmp/msg"
    fi
    openssl pkeyutl -sign -inkey "$dir/sk.pem" -rawin -in "$tmp/msg" -out "$tmp/sig"
    line2=$({ printf '%s' "$alg"; cat "$dir/keyid.raw" "$tmp/sig"; } | b64)
    { cat "$tmp/sig"; printf '%s' "$tc"; } >"$tmp/global.msg"
    openssl pkeyutl -sign -inkey "$dir/sk.pem" -rawin -in "$tmp/global.msg" -out "$tmp/global.sig"
    line4=$(b64 <"$tmp/global.sig")
    printf 'untrusted comment: signature from minisign secret key\n%s\ntrusted comment: %s\n%s\n' \
      "$line2" "$tc" "$line4" >"$file.minisig"
    ;;
  *)
    echo "usage: make-minisig.sh keygen <keydir> | sign <keydir> <file> [--legacy] [comment]" >&2
    exit 2
    ;;
esac
