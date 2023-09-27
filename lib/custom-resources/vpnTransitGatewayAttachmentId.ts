import { CustomResourceBase } from "@constructs/customResourceBase";
import { Construct } from "constructs";
import * as path from "path";

interface VpnTransitGatewayAttachmentIdProps {
  /**
   * Name used to suffix the Lambda function name
   */
  name: string;
}

export class VpnTransitGatewayAttachmentId extends CustomResourceBase {
  constructor(scope: Construct, id: string, props: VpnTransitGatewayAttachmentIdProps) {
    super(scope, id, {
      functionName: `cdk-custom-resource-vpn-tgw-attachment-id-${props.name}`,
      functionDescription: "CDK/CFN Custom Resource to return the Transit Gateway attachement ID for a VPN",
      functionFilePath: path.join(__dirname, "functionCode", "vpnTransitGatewayAttachmentIdLambda.ts"),
      iamAllowActions: ["ec2:DescribeTransitGatewayAttachments"],
    });
  }
}
