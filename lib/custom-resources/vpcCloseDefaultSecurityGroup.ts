import { CustomResourceBase } from "@constructs/customResourceBase";
import { Construct } from "constructs";
import * as path from "path";

export interface VpcCloseDefaultSecurityGroupProps {
  /**
   * Name of the VPC
   *
   * Used to generate a unique name for the custom resource
   */
  name: string;
  /**
   * VPC ID
   */
  vpcId: string;
}

export class VpcCloseDefaultSecurityGroup extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: VpcCloseDefaultSecurityGroupProps) {
    super(scope, id, {
      functionName: `cdk-custom-resource-vpc-close-default-sg-${props.name}`,
      functionDescription: "CDK/CFN Custom Resource to close the default security group in a VPC",
      functionFilePath: path.join(__dirname, "functionCode", "vpcCloseDefaultSecurityGroupLambda.ts"),
      iamAllowActions: [
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeSecurityGroupRules",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupEgress",
      ],
      resourceProperties: {
        vpcId: props.vpcId,
      },
    });
  }
}
