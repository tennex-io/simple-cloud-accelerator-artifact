import { aws_ec2 as ec2, Stack, StackProps } from "aws-cdk-lib";
import { VpnTransitGatewayAttachmentId } from "@customResources/vpnTransitGatewayAttachmentId";
import { Construct } from "constructs";

export interface VpnSiteToSiteProps extends StackProps {
  /**
   * BGP ASN
   *
   * @default 65000
   */
  bgpAsn?: number;
  /**
   * Public IP address of the customer VPN appliance
   */
  customerGatewayIp: string;
  /**
   * Name tag that will be added to the Customer Gateway Resource.  Provides extra console context.
   */
  customerGatewayNameTag: string;
  /**
   * On-prem CIDRs that the VPN should add routes for
   */
  destinationCidrBlocks: string[];
  /**
   * Transit Gateway ID
   */
  transitGatewayId: string;
  /**
   * Transit Gateway Route Table ID
   */
  transitGatewayRouteTableId: string;
  /**
   * Name tag that will be added to the VPN.  Provides extra console context.
   */
  vpnNameTag: string;
}

export class VpnSiteToSite extends Stack {
  constructor(scope: Construct, id: string, props: VpnSiteToSiteProps) {
    super(scope, id, props);

    const cgw = new ec2.CfnCustomerGateway(this, "cgw", {
      bgpAsn: props.bgpAsn ?? 65000,
      ipAddress: props.customerGatewayIp,
      type: "ipsec.1",
      tags: [
        {
          key: "Name",
          value: props.customerGatewayNameTag,
        },
      ],
    });

    const vpn = new ec2.CfnVPNConnection(this, "vpn", {
      customerGatewayId: cgw.attrCustomerGatewayId,
      transitGatewayId: props.transitGatewayId,
      type: "ipsec.1",
      staticRoutesOnly: true,
      tags: [
        {
          key: "Name",
          value: props.vpnNameTag,
        },
      ],
    });

    const vpnAttachment = new VpnTransitGatewayAttachmentId(this, "getVpnAttachmentId", { name: props.vpnNameTag });
    vpnAttachment.node.addDependency(vpn);

    const vpnAttachmentId = vpnAttachment.customResource.getAttString("vpnAttachmentId");

    props.destinationCidrBlocks.forEach((cidr) => {
      new ec2.CfnTransitGatewayRoute(this, `route${cidr}`, {
        transitGatewayRouteTableId: props.transitGatewayRouteTableId,
        transitGatewayAttachmentId: vpnAttachmentId,
        destinationCidrBlock: cidr,
      });
    });
  }
}
