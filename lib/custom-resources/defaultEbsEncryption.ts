import { CustomResourceBase } from "@constructs/customResourceBase";
import { aws_kms as kms } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

export interface DefaultEbsEncryptionProps {
  kmsKey: kms.Key;
}

export class DefaultEbsEncryption extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: DefaultEbsEncryptionProps) {
    super(scope, id, {
      functionName: "cdk-custom-resource-default-ebs-encryption",
      functionDescription: "CDK/CFN Custom Resource for default EBS encryption management",
      functionFilePath: path.join(__dirname, "functionCode", "defaultEbsEncryptionLambda.ts"),
      iamAllowActions: [
        "ec2:EnableEbsEncryptionByDefault",
        "ec2:GetEbsDefaultKmsKeyId",
        "ec2:GetEbsEncryptionByDefault",
        "ec2:ModifyEbsDefaultKmsKeyId",
        "ec2:ResetEbsDefaultKmsKeyId",
      ],
      resourceProperties: {
        kmsKeyArn: props.kmsKey.keyArn,
      },
    });
  }
}
