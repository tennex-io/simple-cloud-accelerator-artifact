import { CustomResourceBase } from "@constructs/customResourceBase";
import { Construct } from "constructs";
import * as path from "path";

export interface AliasProps {
  /**
   * Name of the desired IAM alias
   */
  iamAlias: string;
}

export class IamAlias extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: AliasProps) {
    super(scope, id, {
      functionName: "cdk-custom-resource-iam-alias",
      functionDescription: "CDK/CFN Custom Resource for IAM alias management",
      functionFilePath: path.join(__dirname, "functionCode", "iamAliasLambda.ts"),
      iamAllowActions: ["iam:CreateAccountAlias", "iam:DeleteAccountAlias", "iam:ListAccountAliases"],
      resourceProperties: {
        alias: props.iamAlias,
      },
    });
  }
}
