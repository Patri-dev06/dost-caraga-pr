#!/usr/bin/env python3
"""
PNPKI helper for the DOST Caraga procurement system.

Laravel runs this script with one JSON request on stdin and reads one JSON reply from stdout
(App\\Services\\Pnpki\\PnpkiHelper). The .p12 and its password only ever arrive on stdin: never as
command-line arguments (visible to other processes) and never written to disk.

Commands
  inspect  Opens a .p12 with its password and describes the certificate inside: who it belongs to,
           who issued it, when it is valid, whether it may sign, and whether it chains to a
           trusted PNPKI CA. Used to register a certificate and to check the password at signing.
  sign     Signs one signature field of a PDF with the .p12 (PAdES, as an incremental update, so
           earlier signatures stay valid), showing the signer's signature image in the field.
           The document's other signature fields are created on the first signing, so every
           signatory's place is fixed from the start.
  verify   Checks every signature in a PDF: intact, by whom, when, and trusted.
"""
import asyncio
import base64
import hashlib
import json
import sys
import warnings
from datetime import datetime, timezone

warnings.filterwarnings("ignore")

from asn1crypto import pkcs12 as asn1_pkcs12  # noqa: E402
from asn1crypto import x509 as asn1_x509  # noqa: E402
from cryptography import x509  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.serialization import pkcs12  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402
from io import BytesIO  # noqa: E402

from PIL import Image  # noqa: E402
from pyhanko import stamp  # noqa: E402
from pyhanko.pdf_utils import images  # noqa: E402
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter  # noqa: E402
from pyhanko.pdf_utils.layout import AxisAlignment, InnerScaling, Margins, SimpleBoxLayoutRule  # noqa: E402
from pyhanko.pdf_utils.reader import PdfFileReader  # noqa: E402
from pyhanko.pdf_utils.text import TextBoxStyle  # noqa: E402
from pyhanko.sign import fields, signers  # noqa: E402
from pyhanko.sign.validation import async_validate_pdf_signature  # noqa: E402
from pyhanko_certvalidator import CertificateValidator, ValidationContext  # noqa: E402


class HelperError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def load_p12(request: dict):
    try:
        data = base64.b64decode(request.get("p12", ""), validate=True)
    except (ValueError, TypeError):
        raise HelperError("invalid_file", "The file could not be read.")
    password = str(request.get("password", "")).encode("utf-8")

    try:
        key, cert, extra = pkcs12.load_key_and_certificates(data, password)
    except ValueError:
        # cryptography reports a wrong password and a damaged file the same way; tell them apart
        # by whether the outer PKCS#12 structure parses at all.
        try:
            asn1_pkcs12.Pfx.load(data).native  # noqa: B018
        except Exception:
            raise HelperError("invalid_file", "This is not a PNPKI certificate file (.p12 / .pfx).")
        raise HelperError("wrong_password", "The password is incorrect.")

    if key is None or cert is None:
        raise HelperError("no_key", "This file has no private key and certificate in it. Use the .p12 issued to you by DICT.")
    return key, cert, list(extra or [])


def name_part(name: x509.Name, oid) -> str:
    values = name.get_attributes_for_oid(oid)
    return str(values[0].value) if values else ""


def email_of(cert: x509.Certificate) -> str:
    email = name_part(cert.subject, NameOID.EMAIL_ADDRESS)
    if email:
        return email
    try:
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        emails = san.get_values_for_type(x509.RFC822Name)
        return emails[0] if emails else ""
    except x509.ExtensionNotFound:
        return ""


def can_sign(cert: x509.Certificate) -> bool:
    """Digital signature or non-repudiation key usage (a certificate without the extension may sign)."""
    try:
        usage = cert.extensions.get_extension_for_class(x509.KeyUsage).value
    except x509.ExtensionNotFound:
        return True
    return bool(usage.digital_signature or usage.content_commitment)


def pem(cert: x509.Certificate) -> str:
    return cert.public_bytes(serialization.Encoding.PEM).decode("ascii")


def to_asn1(cert: x509.Certificate) -> asn1_x509.Certificate:
    return asn1_x509.Certificate.load(cert.public_bytes(serialization.Encoding.DER))


def trust_of(cert: x509.Certificate, extra: list, trusted_roots_pem: list) -> tuple:
    """(trusted, reason): does the certificate chain to one of the trusted PNPKI CA certificates?"""
    roots = []
    for block in trusted_roots_pem:
        for loaded in x509.load_pem_x509_certificates(block.encode("ascii")):
            roots.append(to_asn1(loaded))
    if not roots:
        return False, "No trusted PNPKI CA certificate is set up on the server."

    context = ValidationContext(
        trust_roots=roots,
        other_certs=[to_asn1(c) for c in extra],
        allow_fetching=False,
        revocation_mode="soft-fail",
    )
    validator = CertificateValidator(to_asn1(cert), intermediate_certs=[to_asn1(c) for c in extra], validation_context=context)
    try:
        asyncio.run(validator.async_validate_usage(set()))
    except Exception as error:  # path building, signature, validity or revocation failure
        return False, str(error) or error.__class__.__name__
    return True, ""


def inspect_command(request: dict) -> dict:
    _key, cert, extra = load_p12(request)
    trusted, trust_error = trust_of(cert, extra, request.get("trusted_roots") or [])
    now = datetime.now(timezone.utc)

    return {
        "ok": True,
        "subject_cn": name_part(cert.subject, NameOID.COMMON_NAME),
        "subject_dn": cert.subject.rfc4514_string(),
        "email": email_of(cert),
        "serial": format(cert.serial_number, "X"),
        "issuer_cn": name_part(cert.issuer, NameOID.COMMON_NAME),
        "issuer_dn": cert.issuer.rfc4514_string(),
        "fingerprint_sha256": hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest(),
        "valid_from": cert.not_valid_before_utc.isoformat(),
        "valid_to": cert.not_valid_after_utc.isoformat(),
        "currently_valid": cert.not_valid_before_utc <= now <= cert.not_valid_after_utc,
        "can_sign": can_sign(cert),
        "trusted": trusted,
        "trust_error": trust_error,
        "certificate_pem": pem(cert),
        "chain_pem": "".join(pem(c) for c in extra),
    }


def roots_of(request: dict) -> list:
    roots = []
    for block in request.get("trusted_roots") or []:
        roots.extend(to_asn1(c) for c in x509.load_pem_x509_certificates(block.encode("ascii")))
    return roots


def appearance(image_b64: str, box_height: float) -> stamp.TextStampStyle:
    """The signer's signature image above two small lines: who signed digitally, and when."""
    text_style = TextBoxStyle(font_size=6, leading=7)
    background = None
    if image_b64:
        try:
            picture = Image.open(BytesIO(base64.b64decode(image_b64))).convert("RGBA")
            # Flatten transparency onto white: PDF images here have no alpha channel.
            flat = Image.new("RGB", picture.size, (255, 255, 255))
            flat.paste(picture, mask=picture.split()[3])
            background = images.PdfImage(flat)
        except Exception:
            background = None
    return stamp.TextStampStyle(
        stamp_text="Digitally signed by %(signer)s\nDate: %(signed_at)s",
        text_box_style=text_style,
        border_width=0,
        background=background,
        background_opacity=1.0,
        # The image fills the top of the box; the text sits under it.
        background_layout=SimpleBoxLayoutRule(
            x_align=AxisAlignment.ALIGN_MID, y_align=AxisAlignment.ALIGN_MAX,
            margins=Margins(left=2, right=2, top=1, bottom=15), inner_content_scaling=InnerScaling.SHRINK_TO_FIT,
        ),
        inner_content_layout=SimpleBoxLayoutRule(
            x_align=AxisAlignment.ALIGN_MID, y_align=AxisAlignment.ALIGN_MIN,
            margins=Margins(left=1, right=1, top=1, bottom=1), inner_content_scaling=InnerScaling.NO_SCALING,
        ),
    )


def sign_command(request: dict) -> dict:
    load_p12(request)  # checks the password and that the file holds a key and certificate
    p12 = base64.b64decode(request["p12"])
    password = str(request.get("password", "")).encode("utf-8")
    signer = signers.SimpleSigner.load_pkcs12_data(p12, other_certs=[], passphrase=password)

    writer = IncrementalPdfFileWriter(BytesIO(base64.b64decode(request["pdf"])))
    existing = {name: filled for name, filled, _ref in fields.enumerate_sig_fields(writer.prev, filled_status=None)}
    target = request["field"]
    if existing.get(target):
        raise HelperError("already_signed", "This part of the document is already signed.")

    for spec in request.get("fields") or []:
        if spec["name"] not in existing:
            fields.append_signature_field(writer, fields.SigFieldSpec(
                sig_field_name=spec["name"], on_page=int(spec["page"]), box=tuple(int(round(float(v))) for v in spec["box"]),
            ))
    box = next((spec["box"] for spec in request.get("fields") or [] if spec["name"] == target), None)

    meta = signers.PdfSignatureMetadata(
        field_name=target,
        md_algorithm="sha256",
        subfilter=fields.SigSeedSubFilter.PADES,
        reason=request.get("reason") or None,
        location=request.get("location") or None,
        name=request.get("signer_name") or None,
    )
    pdf_signer = signers.PdfSigner(meta, signer=signer, stamp_style=appearance(request.get("image") or "", float(box[3] - box[1]) if box else 60))
    output = BytesIO()
    pdf_signer.sign_pdf(writer, output=output, appearance_text_params={"signed_at": request.get("signed_at_text") or ""})

    return {"ok": True, "pdf": base64.b64encode(output.getvalue()).decode("ascii")}


def verify_command(request: dict) -> dict:
    reader = PdfFileReader(BytesIO(base64.b64decode(request["pdf"])))
    roots = roots_of(request)
    results = []
    for embedded in reader.embedded_signatures:
        context = ValidationContext(trust_roots=roots, allow_fetching=False, revocation_mode="soft-fail")
        status = asyncio.run(async_validate_pdf_signature(embedded, context))
        cert = status.signing_cert
        results.append({
            "field": embedded.field_name,
            "intact": bool(status.intact),
            "valid": bool(status.valid),
            "trusted": bool(status.trusted),
            "signer_cn": cert.subject.native.get("common_name", "") if cert else "",
            "serial": format(cert.serial_number, "X") if cert else "",
            "signed_at": status.signer_reported_dt.isoformat() if status.signer_reported_dt else None,
            "coverage": status.coverage.name if status.coverage else None,
            "modification_level": status.modification_level.name if status.modification_level else None,
            "summary": status.summary(),
        })
    return {"ok": True, "signatures": results}


COMMANDS = {"inspect": inspect_command, "sign": sign_command, "verify": verify_command}


def main() -> None:
    try:
        request = json.loads(sys.stdin.read() or "{}")
        command = COMMANDS.get(request.get("command"))
        if command is None:
            raise HelperError("unknown_command", "Unknown command.")
        reply = command(request)
    except HelperError as error:
        reply = {"ok": False, "error": error.code, "message": error.message}
    except Exception as error:  # never echo secrets; only the error type and message
        reply = {"ok": False, "error": "helper_failed", "message": f"{error.__class__.__name__}: {error}"}
    sys.stdout.write(json.dumps(reply))


if __name__ == "__main__":
    main()
