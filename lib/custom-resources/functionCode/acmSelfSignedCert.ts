import { pki, md } from "node-forge";
import { ACMClient, ImportCertificateCommand, Tag } from "@aws-sdk/client-acm";
import { CloudFormationCustomResourceEvent, Context } from "aws-lambda";

export async function handler(event: CloudFormationCustomResourceEvent, context: Context): Promise<any> {
  console.log("event", event);
  const tags: Tag[] = event.ResourceProperties.tags;
  try {
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 3);
    const attrs = [
      {
        name: "commonName",
        value: "clientvpn.selfsigned",
      },
      {
        name: "countryName",
        value: "US",
      },
      {
        shortName: "ST",
        value: "Virginia",
      },
      {
        name: "localityName",
        value: "Ashburn",
      },
      {
        name: "organizationName",
        value: "ClientVPN",
      },
      {
        shortName: "OU",
        value: "VPN",
      },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
      {
        name: "basicConstraints",
        cA: true,
      },
      {
        name: "keyUsage",
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
      },
      {
        name: "extKeyUsage",
        serverAuth: true,
        clientAuth: true,
        codeSigning: true,
        emailProtection: true,
        timeStamping: true,
      },
      {
        name: "nsCertType",
        client: true,
        server: true,
        email: true,
        objsign: true,
        sslCA: true,
        emailCA: true,
        objCA: true,
      },
      {
        name: "subjectKeyIdentifier",
      },
    ]);

    // self-sign certificate
    cert.sign(keys.privateKey, md.sha256.create());
    console.log("Certificate created.");

    const client = new ACMClient({});
    const command = new ImportCertificateCommand({
      Certificate: Buffer.from(pki.certificateToPem(cert)),
      PrivateKey: Buffer.from(pki.privateKeyToPem(keys.privateKey)),
      Tags: tags,
    });
    const response = await client.send(command);
    console.log("Certificate imported into ACM.");
    return {
      Data: {
        certificateArn: response.CertificateArn!,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return error.message;
    }
    return "Unhandled error";
  }
}
