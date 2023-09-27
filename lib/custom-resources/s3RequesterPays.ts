import { CustomResourceBase } from "@constructs/customResourceBase";
import { Construct } from "constructs";
import * as path from "path";

export class S3RequesterPays extends CustomResourceBase {
  constructor(scope: Construct, id: string, bucketName: string) {
    super(scope, id, {
      functionName: "cdk-custom-resource-s3-requester-pays",
      functionDescription: "CDK/CFN Custom Resource to enable requester pays on a bucket",
      functionFilePath: path.join(__dirname, "functionCode", "s3RequesterPaysLambda.ts"),
      iamAllowActions: ["s3:PutBucketRequestPayment"],
      resourceProperties: {
        bucketName,
      },
    });
  }
}
