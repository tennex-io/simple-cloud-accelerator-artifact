import { CustomResourceBase } from "@constructs/customResourceBase";
import { PrefixListName } from "@lib/types";
import { Construct } from "constructs";
import * as path from "path";

export interface Ec2PrefixListProps {}

export class Ec2PrefixList extends CustomResourceBase {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      functionName: "cdk-custom-resource-ec2-managed-prefix-list",
      functionDescription: "CDK/CFN Custom Resource to gather EC2 prefix lists for route and security group use",
      functionFilePath: path.join(__dirname, "functionCode", "ec2PrefixListLambda.ts"),
      iamAllowActions: ["ec2:DescribeManagedPrefixLists"],
    });
  }

  public getId(prefixListName: PrefixListName) {
    return this.customResource.getAtt(prefixListName).toString();
  }
}
