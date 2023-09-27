import { CustomResourceBase } from "@constructs/customResourceBase";
import { Construct } from "constructs";
import * as path from "path";

export class AcmSelfSignedCert extends CustomResourceBase {
  constructor(scope: Construct, id: string, tags?: { Key: string; Value: string }[]) {
    super(scope, id, {
      functionName: "cdk-custom-resource-acm-self-signed-cert",
      functionDescription: "CDK/CFN Custom Resource create a self-signed certificate and import it into ACM",
      functionFilePath: path.join(__dirname, "functionCode", "acmSelfSignedCert.ts"),
      iamAllowActions: ["acm:ImportCertificate", "acm:AddTagsToCertificate"],
      resourceProperties: {
        tags,
      },
    });
  }
}
