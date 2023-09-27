import { CustomResourceBase } from "@constructs/customResourceBase";
import { Construct } from "constructs";
import * as path from "path";

export class S3blockPublicAccess extends CustomResourceBase {
  constructor(scope: Construct, id: string, accountId: string) {
    super(scope, id, {
      functionName: "cdk-custom-resource-s3-block-public-access",
      functionDescription: "CDK/CFN Custom Resource to block public S3 access",
      functionFilePath: path.join(__dirname, "functionCode", "s3blockPublicAccessLambda.ts"),
      iamAllowActions: [
        "s3:GetAccountPublicAccessBlock",
        "s3:PutAccountPublicAccessBlock",
        "s3:PutAccessPointPublicAccessBlock",
      ],
      resourceProperties: {
        accountId,
      },
    });
  }
}
