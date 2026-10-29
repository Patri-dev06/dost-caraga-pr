#!/usr/bin/env python3
"""
Writes the TEST certificates used by the automated tests to tests/fixtures/pnpki/. They come from a
made-up "Test PNPKI Root CA" and are never trusted outside the test suite. Password: test-password.

  signing/.venv/bin/python signing/make_test_certs.py
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives.serialization.pkcs12 import PBES
from cryptography.x509.oid import NameOID

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "pnpki"
PASSWORD = b"test-password"
NOW = datetime.now(timezone.utc)


def key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def name(cn: str, org: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COUNTRY_NAME, "PH"), x509.NameAttribute(NameOID.ORGANIZATION_NAME, org), x509.NameAttribute(NameOID.COMMON_NAME, cn)])


def ca(cn: str):
    k = key()
    cert = (
        x509.CertificateBuilder().subject_name(name(cn, "Test DICT")).issuer_name(name(cn, "Test DICT"))
        .public_key(k.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(NOW - timedelta(days=1)).not_valid_after(NOW + timedelta(days=365 * 30))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=False, content_commitment=False, key_encipherment=False, data_encipherment=False,
                                     key_agreement=False, key_cert_sign=True, crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
        .sign(k, hashes.SHA256())
    )
    return k, cert


def person(cn: str, email: str, issuer_key, issuer_cert, *, start=None, end=None):
    k = key()
    cert = (
        x509.CertificateBuilder().subject_name(name(cn, "Department of Science and Technology")).issuer_name(issuer_cert.subject)
        .public_key(k.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(start or NOW - timedelta(days=1)).not_valid_after(end or NOW + timedelta(days=365 * 30))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=True, key_encipherment=False, data_encipherment=False,
                                     key_agreement=False, key_cert_sign=False, crl_sign=False, encipher_only=False, decipher_only=False), critical=True)
        .add_extension(x509.SubjectAlternativeName([x509.RFC822Name(email)]), critical=False)
        .sign(issuer_key, hashes.SHA256())
    )
    return k, cert


def write_p12(path: str, k, cert, chain, *, legacy=False):
    if legacy:
        # The older encryption (3DES) many existing .p12 files use, which PHP's OpenSSL 3 cannot open.
        encryption = (serialization.PrivateFormat.PKCS12.encryption_builder()
                      .kdf_rounds(2048).key_cert_algorithm(PBES.PBESv1SHA1And3KeyTripleDESCBC).hmac_hash(hashes.SHA1()).build(PASSWORD))
    else:
        encryption = serialization.BestAvailableEncryption(PASSWORD)
    (OUT / path).write_bytes(pkcs12.serialize_key_and_certificates(cert.subject.rfc4514_string().encode(), k, cert, chain, encryption))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    root_key, root = ca("Test PNPKI Root CA")
    other_key, other = ca("Some Other CA")
    (OUT / "test-root-ca.pem").write_bytes(root.public_bytes(serialization.Encoding.PEM))

    k, c = person("JUAN DELA CRUZ", "juan.delacruz@dost.gov.ph", root_key, root)
    write_p12("juan.p12", k, c, [root])
    write_p12("juan-legacy.p12", k, c, [root], legacy=True)

    k, c = person("MARIA SANTOS", "maria.santos@dost.gov.ph", root_key, root)
    write_p12("maria.p12", k, c, [root])

    k, c = person("PEDRO REYES", "pedro.reyes@dost.gov.ph", root_key, root)
    write_p12("pedro.p12", k, c, [root])

    k, c = person("JUAN DELA CRUZ", "juan.delacruz@dost.gov.ph", root_key, root, start=NOW - timedelta(days=400), end=NOW - timedelta(days=30))
    write_p12("juan-expired.p12", k, c, [root])

    k, c = person("JUAN DELA CRUZ", "juan.delacruz@dost.gov.ph", other_key, other)
    write_p12("juan-untrusted.p12", k, c, [other])

    (OUT / "README.md").write_text(
        "Test certificates for the PNPKI tests, made by `signing/make_test_certs.py` from a made-up\n"
        "\"Test PNPKI Root CA\". Never trust them anywhere else. Password for every .p12: `test-password`.\n"
    )


if __name__ == "__main__":
    main()
