import { AcmSelfSignedCert } from "@customResources/acmSelftSignedCert";
import { aws_ec2 as ec2, aws_logs as logs, aws_iam as iam, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface ClientVpnProps extends StackProps {
  /**
   * Allow users to access the local VPC.  For accessing spoke VPCs, it is
   * recommended to add routes to the Client VPN endpoint directly.
   *
   * @default false
   */
  allowUsersAccessToVpc?: boolean;
  /**
   * List of DNS servers
   *
   * Specify the VPC DNS (x.x.x.2) address at a minimum if resolving internal DNS
   * @default undefined
   */
  dnsServers?: string[];
  /**
   * Client VPN CloudWatch log retention duration
   *
   * @default logs.RetentionDays.ONE_YEAR
   */
  logRetention?: logs.RetentionDays;
  /**
   * Name used for resource naming
   */
  name: string;
  /**
   * Path to the SAML Identity Provider metadata for authenticating users
   */
  providerMetadataFilePath: string;
  /**
   * Path to the SAML Identity Provider metadata file for the Self Service Portal
   *
   * This can be the same file as `providerMetadataFilePath` if the IdP supports
   * multiple ACS URLs and https://self-service.clientvpn.amazonaws.com/api/auth/sso/saml is one those URLs
   *
   * @link https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/client-authentication.html#federated-authentication
   */
  providerSelfServiceMetadataFilePath: string;
  /**
   * User VPN session timeout
   *
   * @default ec2.ClientVpnSessionTimeout.TWELVE_HOURS
   */
  sessionTimeout?: ec2.ClientVpnSessionTimeout;
  /**
   * Split tunnel or full tunnel
   *
   * A false value creates a full tunnel, meaning all user traffic goes over the tunnel
   * A true value allows granular routing to be set for only certain CIDRs to go over the tunnel
   *
   * @default false
   */
  splitTunnel?: boolean;
  /**
   * Spoke VPC CIDRs that should be accessible via the VPN.  These CIDRs will be routed
   * to the VPCs transit subnets.
   */
  spokeVpcCidrs?: string[];
  /**
   * VPC to deploy into.  Public subnets are targeted.
   */
  vpc: ec2.Vpc;
  /**
   * Inside private CIDR for the VPN
   *
   * Must be a /22 or greater
   *
   * @default 172.18.0.0/22
   */
  vpnCidr?: string;
}

export class ClientVpn extends Stack {
  constructor(scope: Construct, id: string, props: ClientVpnProps) {
    super(scope, id, props);

    const cert = new AcmSelfSignedCert(this, "customResourceAcmSelfSigned", [
      {
        Key: "description",
        Value: "self signed certificate created by Lambda used for AWS Client VPN",
      },
      {
        Key: "Name",
        Value: props.name,
      },
    ]);
    const certArn = cert.customResource.getAttString("certificateArn");

    const idp = new iam.SamlProvider(this, "idp", {
      metadataDocument: iam.SamlMetadataDocument.fromFile(props.providerMetadataFilePath),
      name: props.name,
    });

    const selfServiceIdp = new iam.SamlProvider(this, "selfServiceIdp", {
      metadataDocument: iam.SamlMetadataDocument.fromFile(props.providerSelfServiceMetadataFilePath),
      name: `${props.name}-self-service-portal`,
    });

    const logGroup = new logs.LogGroup(this, "logGroup", {
      logGroupName: `/clientvpn/${props.name}`,
      retention: props.logRetention ?? logs.RetentionDays.ONE_YEAR,
    });

    const securityGroup = new ec2.SecurityGroup(this, "enpointSecurityGroup", {
      description: `client-vpn ${props.name}`,
      securityGroupName: `client-vpn-${props.name}`,
      vpc: props.vpc,
    });

    const endpoint = new ec2.ClientVpnEndpoint(this, "endpoint", {
      authorizeAllUsersToVpcCidr: props.allowUsersAccessToVpc ?? false,
      userBasedAuthentication: ec2.ClientVpnUserBasedAuthentication.federated(idp, selfServiceIdp),
      cidr: props.vpnCidr ?? "172.18.0.0/22",
      dnsServers: props.dnsServers,
      logging: true,
      logGroup,
      serverCertificateArn: certArn,
      sessionTimeout: props.sessionTimeout ?? ec2.ClientVpnSessionTimeout.TWELVE_HOURS,
      splitTunnel: props.splitTunnel ?? false,
      securityGroups: [securityGroup],
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
    });

    // Client VPN uses tag specifications instead of the Tags() class
    const cfnEndpoint = endpoint.node.defaultChild as ec2.CfnClientVpnEndpoint;
    cfnEndpoint.tagSpecifications = [
      {
        resourceType: "client-vpn-endpoint",
        tags: [
          {
            key: "Name",
            value: props.name,
          },
        ],
      },
    ];

    // If it's a full tunnel, authorize all  access.  This covers internet and internal VPCs
    if (!props.splitTunnel) {
      endpoint.addAuthorizationRule("internetAuthorization", {
        cidr: "0.0.0.0/0",
        description: "full access",
      });
    } else {
      // Authorize only spoke VPC access
      props.spokeVpcCidrs?.forEach((cidr) => {
        endpoint.addAuthorizationRule(cidr, {
          cidr,
          description: "spoke vpc access",
        });
      });
    }

    props.vpc.publicSubnets.forEach((subnet, idx) => {
      // If it's a full tunnel allow outbound internet traffic for connected users
      if (!props.splitTunnel) {
        endpoint.addRoute(`internet-${idx}`, {
          cidr: "0.0.0.0/0",
          target: ec2.ClientVpnRouteTarget.subnet(subnet),
          description: "Internet via public subnet",
        });
      }

      // Routes for spoke VPCs in other accounts.
      // These will traverse the Transit Gateway
      props.spokeVpcCidrs?.forEach((cidr) => {
        endpoint.addRoute(`spoke-${cidr}-${idx}`, {
          cidr,
          target: ec2.ClientVpnRouteTarget.subnet(subnet),
          description: "spoke vpc via vpc to tgw",
        });
      });
    });
  }
}
