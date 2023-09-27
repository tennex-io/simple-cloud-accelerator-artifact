import { VpcCloseDefaultSecurityGroup } from "@customResources/vpcCloseDefaultSecurityGroup";
import { getTransitSubnetCidrsFromVpcCidr, stripCidr } from "@helpers/cidr";
import { friendlySubnetType, naclEntry } from "@lib/types";
import {
  aws_ec2 as ec2,
  aws_logs as logs,
  aws_secretsmanager as secretsmanager,
  RemovalPolicy,
  Stack,
  StackProps,
  Tags,
} from "aws-cdk-lib";
import { Construct } from "constructs";

type primarySubnetTypes = Exclude<friendlySubnetType, friendlySubnetType.transit>;

interface TransitGatewayProps {
  /**
   * Transit Gateway ID
   *
   * Used to spectify a Transit Gateway by ID.
   * If omitted, sharedAccountSecretPartialArn is required.
   */
  transitGatewayId?: string;
  /**
   * AWS Secrets Manager secret partial secret from the shared account
   *
   * Used to specify a secret that contains a Transit Gateway ID with the key 'id'.
   * It is a partial ARN in that it does not require the Secrets Manager suffix.
   *
   * Proper ARN
   * @example arn:aws:secretsmanager:REGION:999999999999:secret:transitGateway
   *
   * **Incorrect ARN**
   * @example arn:aws:secretsmanager:REGION:999999999999:secret:transitGateway-AJdbCL
   *
   * If omitted, transitGatewayId is required.
   */
  sharedAccountSecretPartialArn?: string;
  /**
   * Subnet targets and CIDRs that should be routed to the Transit Gateway
   *
   * Routes are added to the particular subnet types for each respective CIDR.
   *
   * @example { friendlySubnetType.private: ['10.10.0.0/16', '10.11.0.0/16'] }
   */
  routes?: Partial<Record<primarySubnetTypes, string[]>>;
}

interface VpcProps extends Omit<ec2.VpcProps, "cidr" | "ipAddresses"> {
  /**
   * VPC CIDR
   *
   * A /16 is most common and recommended.  A value smaller than /24 may not have
   * adequate address space to accomodate a standard deployment with Transit Gateway
   * subnets.
   *
   * @example '10.0.0.0/16'
   */
  cidrBlock: string | undefined;
  /**
   * NAT type - gateway or instance.
   *
   * @default gateway
   */
  natType?: "instance" | "gateway";
  /**
   * Size of the nat instance, if 'natType' is set to 'instance'.
   *
   * @default t3.micro
   */
  natInstanceSize?: ec2.InstanceType;
  /**
   * Number of NAT Gateways.
   *
   * Setting this to a number lower than the number of Availability Zones
   * will enable cross-AZ routing.  This should only be done for development
   * environments.
   */
  natGateways?: number;
  /**
   * Transit Gateway properties
   *
   * Use this to connect an existing Transit Gateway to the VPC
   */
  transitGatewayProps?: TransitGatewayProps;
}

export interface VpcStackProps extends StackProps {
  /**
   * VPC FlowLog CloudWatch Log retention
   *
   * @default logs.RetentionDays.ONE_WEEK
   */
  flowlogRetention?: logs.RetentionDays;
  /**
   * Name used for tagging and prefixing.
   */
  name: string;
  /**
   * VPC Properties
   */
  vpcProps: VpcProps;
}

export class Vpc extends Stack {
  public vpc: ec2.Vpc;
  public transitGatewayAttachmentId: string;
  public vpcSecurityGroup: ec2.SecurityGroup;

  public naclIds: Record<friendlySubnetType, string[]> = {
    public: [],
    private: [],
    isolated: [],
    transit: [],
  };

  public subnetIds: Record<friendlySubnetType, string[]> = {
    public: [],
    private: [],
    isolated: [],
    transit: [],
  };

  public routeTableIds: Record<friendlySubnetType, string[]> = {
    public: [],
    private: [],
    isolated: [],
    transit: [],
  };

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    const { vpcProps } = props;
    const natType = vpcProps.natType ?? "gateway";

    // Handle if a CIDR isn't set in the core config file or explicitly at the stack level.
    // Handling here allows us to provide the user context on where to set the CIDR.
    if (!vpcProps.cidrBlock) {
      throw new Error(`\nThe VPC CIDR block must be defined.
      \nSpecify a CIDR via the stack properties, or via the account properties in core configuration file.
The core configuration file is located in the 'config' directory in the top level of the repository.`);
    }

    // Handle selection of a NAT instance over an AWS Managed NAT Gateway
    let natGatewayProvider;
    if (natType === "instance") {
      natGatewayProvider = new ec2.NatInstanceProvider({
        instanceType: vpcProps.natInstanceSize ?? new ec2.InstanceType("t3.micro"),
        defaultAllowedTraffic: ec2.NatTrafficDirection.OUTBOUND_ONLY,
      });
    }

    this.vpc = new ec2.Vpc(this, props.name, {
      ...vpcProps,
      ipAddresses: ec2.IpAddresses.cidr(vpcProps.cidrBlock),
      natGatewayProvider,
      natGateways: vpcProps.natGateways,
      subnetConfiguration: vpcProps.subnetConfiguration ?? defaultSubnetConfiguration,
    });

    // If selected, handle the NAT instance(s) setup
    if (natGatewayProvider) {
      // NAT instances should have an EIP for proper whitelisting
      natGatewayProvider.configuredGateways.forEach((nat) => {
        new ec2.CfnEIP(this, `natEip${nat.az}`, {
          instanceId: nat.gatewayId,
          tags: [
            {
              key: "Name",
              value: `nat-${props.name}-${nat.az}`,
            },
          ],
        });
      });

      // Allow the VPC ingress to the NAT
      natGatewayProvider.securityGroup.addIngressRule(
        ec2.Peer.ipv4(vpcProps.cidrBlock),
        ec2.Port.allTraffic(),
        "VPC CIDR"
      );
    }

    // Classify subnet IDs, associated route table IDs, and NACLs from the VPC construct
    // Must be before Transit Gateway setup for proper CDK token dependencies
    this.vpc.publicSubnets.forEach((subnet) => {
      this.classifySubnet(subnet, friendlySubnetType.public);
    });

    this.vpc.privateSubnets.forEach((subnet) => {
      this.classifySubnet(subnet, friendlySubnetType.private);
    });

    this.vpc.isolatedSubnets.forEach((subnet) => {
      this.classifySubnet(subnet, friendlySubnetType.isolated);
    });

    // Create a TransitGateway subnet with a /26 in each AZ with:
    // - single route table
    // - single NACL
    // Single route table and NACL are per AWS Best Practices
    if (vpcProps.transitGatewayProps) {
      this.configureTransitGateway(props.name, vpcProps.cidrBlock, vpcProps.transitGatewayProps);
    }

    // VPC Gateway Endpoints (S3 and DynamoDB)
    // Added using cfn because a Transit Gateway route table is a custom override
    ["dynamodb", "s3"].forEach((endpoint) => {
      new ec2.CfnVPCEndpoint(this, `endpoint${endpoint}`, {
        serviceName: `com.amazonaws.${this.region}.${endpoint}`,
        vpcId: this.vpc.vpcId,
        routeTableIds: [
          ...this.routeTableIds.public,
          ...this.routeTableIds.private,
          ...this.routeTableIds.isolated,
          ...this.routeTableIds.transit,
        ],
      });
    });

    // Generic service based security groups for end users to attach
    this.createVpcSecurityGroup(`${props.name}-ssh-internal`, "SSH", 22, "TCP");
    this.createVpcSecurityGroup(`${props.name}-rdp-internal`, "RDP", 3389, "TCP");

    this.addFlowlogs(props.name, props.flowlogRetention ?? logs.RetentionDays.ONE_WEEK);

    Tags.of(this.vpc).add("Name", props.name);

    // Close the default security group for Config compliance
    new VpcCloseDefaultSecurityGroup(this, "closeDefaultSecurityGroup", {
      name: props.name,
      vpcId: this.vpc.vpcId,
    });
  }

  /**
   * Adds the default NACLs for a specific subnet type and exposes the
   * subnet IDs, route table IDs, and NACL IDs as public properties
   *
   * @param subnet
   * @param subnetType
   */
  private classifySubnet(subnet: ec2.ISubnet, subnetType: friendlySubnetType) {
    this.addNacls(this.vpc, subnet, subnetType);
    this.routeTableIds[subnetType].push(subnet.routeTable.routeTableId);
    this.subnetIds[subnetType].push(subnet.subnetId);
  }

  /**
   * Add a route to a specific type of subnet.
   *
   * Routes are added to all route tables associated with the subnet type.
   * E.g. A value of '10.1.0.0/16' added to the 'public' type will be added to all public subnets.
   *
   * Transit Gateway routes are not supported. Instead, use the TransitGatewayProps interface.
   *
   * @param subnetType - friendly subnet type
   * @param cidrs - list of strings for target CIDRs
   * @param target - string of a Gateway ID, Instance ID, NAT Gateway ID, ENI, peering connection, or VPC Endpoint ID
   */
  public addRouteToSubnetType(subnetType: primarySubnetTypes, cidrs: string[], target: string) {
    this.routeTableIds[subnetType].forEach((routeTableId, index) => {
      cidrs.forEach((cidr) => {
        const strippedCidr = stripCidr(cidr);
        new ec2.CfnRoute(this, `${subnetType}${index}-${strippedCidr}`, {
          routeTableId,
          destinationCidrBlock: cidr,
          gatewayId: target.startsWith("igw-") ? target : undefined,
          instanceId: target.startsWith("i-") ? target : undefined,
          natGatewayId: target.startsWith("nat-") ? target : undefined,
          networkInterfaceId: target.startsWith("eni-") ? target : undefined,
          vpcEndpointId: target.startsWith("vpce-") ? target : undefined,
          vpcPeeringConnectionId: target.startsWith("pcx-") ? target : undefined,
        });
      });
    });
  }

  /**
   *
   * @param subnetType
   * @param naclEntry
   */
  public addNaclToSubnetType(subnetType: primarySubnetTypes, naclEntry: naclEntry) {
    this.naclIds[subnetType].forEach((naclId, index) => {
      new ec2.CfnNetworkAclEntry(this, `nacl${subnetType}${naclEntry.cidr}${index}${naclEntry.ruleNumber}`, {
        networkAclId: naclId,
        protocol: naclEntry.protocol,
        ruleAction: naclEntry.action,
        ruleNumber: naclEntry.ruleNumber,
        cidrBlock: naclEntry.cidr,
        egress: naclEntry.egress ?? false,
        portRange: naclEntry.portRange,
      });
    });
  }

  /**
   * Default public NACLs
   *
   * @param nacl
   */
  private addPublicNacls(nacl: ec2.NetworkAcl) {
    // Begin ingress
    nacl.addEntry("AllowAllVpcIngress", {
      cidr: ec2.AclCidr.ipv4(this.vpc.vpcCidrBlock),
      ruleNumber: 100,
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    nacl.addEntry("AllowAllIngressHttps", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 300,
      traffic: ec2.AclTraffic.tcpPort(443),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    nacl.addEntry("AllowEphemeralTcpIngress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 500,
      traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    nacl.addEntry("AllowEphemeralUdpIngress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 510,
      traffic: ec2.AclTraffic.udpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Begin egress
    nacl.addEntry("AllowEphemeralTcpEngress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 100,
      traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    nacl.addEntry("AllowEphemeraUdpEngress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 110,
      traffic: ec2.AclTraffic.udpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    nacl.addEntry("AllowAllEgress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 600,
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });
  }

  /**
   * Default private NACLs
   *
   * @param nacl
   */
  private addPrivateNacls(nacl: ec2.NetworkAcl) {
    // Begin ingress
    nacl.addEntry("AllowAllVpcIngress", {
      cidr: ec2.AclCidr.ipv4(this.vpc.vpcCidrBlock),
      ruleNumber: 100,
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    nacl.addEntry("AllowEphemeralTcpIngress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 500,
      traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    nacl.addEntry("AllowEphemeralUdpIngress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 510,
      traffic: ec2.AclTraffic.udpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Begin egress
    nacl.addEntry("AllowAllEgress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 100,
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });
  }

  /**
   * Default isolated NACLs
   *
   * @param nacl
   */
  private addIsolatedNacls(nacl: ec2.NetworkAcl) {
    // Begin ingress
    nacl.addEntry("AllowVpcIngress", {
      cidr: ec2.AclCidr.ipv4(this.vpc.vpcCidrBlock),
      ruleNumber: 100,
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    nacl.addEntry("AllowEphemeralTcpIngress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 500,
      traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    nacl.addEntry("AllowEphemeralUdpIngress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 510,
      traffic: ec2.AclTraffic.udpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Begin egress
    nacl.addEntry("AllowAllEgress", {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 100,
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });
  }

  /**
   * Create the proper NACLs for each specific subnet type
   *
   * @param vpc
   * @param subnet
   * @param subnetType
   */
  private addNacls(vpc: ec2.Vpc, subnet: ec2.ISubnet, subnetType: friendlySubnetType) {
    const nacl = new ec2.NetworkAcl(this, `nacl${subnetType}${subnet.availabilityZone}`, {
      vpc,
      subnetSelection: { subnets: [subnet] },
    });

    Tags.of(nacl).add("Name", `${this.stackName}/${subnet.availabilityZone}/${subnetType}`);

    switch (subnetType) {
      case "public":
        this.addPublicNacls(nacl);
        this.naclIds.public.push(nacl.networkAclId);
        break;
      case "private":
        this.addPrivateNacls(nacl);
        this.naclIds.private.push(nacl.networkAclId);
        break;
      case "isolated":
        this.addIsolatedNacls(nacl);
        this.naclIds.isolated.push(nacl.networkAclId);
        break;
      default:
        break;
    }
  }

  /**
   * Add Transit Gateway Open NACLs
   *
   * @url https://docs.aws.amazon.com/vpc/latest/tgw/tgw-best-design-practices.html
   * @param naclId - Network ACL ID
   */
  private addTransitNacls(naclId: string) {
    new ec2.CfnNetworkAclEntry(this, "transitNaclIngress100", {
      networkAclId: naclId,
      ruleNumber: 100,
      protocol: -1,
      ruleAction: "allow",
      cidrBlock: "0.0.0.0/0",
      egress: false,
    });

    new ec2.CfnNetworkAclEntry(this, "transitNaclEgress100", {
      networkAclId: naclId,
      ruleNumber: 100,
      protocol: -1,
      ruleAction: "allow",
      cidrBlock: "0.0.0.0/0",
      egress: true,
    });
  }

  /**
   * Add flowlogs to the VPC
   *
   * @param name - name for the flowlogs group.  Resolves to /flowlogs/<NAME>
   * @param retention - CloudWatch Log retention in days
   */
  private addFlowlogs(name: string, retention: logs.RetentionDays) {
    const flowLogGroup = new logs.LogGroup(this, "flowLogs", {
      logGroupName: `/flowlogs/${name}`,
      retention,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.vpc.addFlowLog("flowLogAssociation", {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
    });
  }

  private configureTransitGateway(name: string, vpcCidr: string, transitGatewayProps: TransitGatewayProps) {
    if (transitGatewayProps.sharedAccountSecretPartialArn && transitGatewayProps.transitGatewayId) {
      throw new Error(
        "Only one of transitGatewayProps.sharedAccountSecretPartialArn or transitGatewayProps.transitGatewayId can be specified."
      );
    }
    if (!transitGatewayProps.sharedAccountSecretPartialArn && !transitGatewayProps.transitGatewayId) {
      throw new Error(
        "One of transitGatewayProps.sharedAccountSecretPartialArn or transitGatewayProps.transitGatewayId must be specified."
      );
    }

    const transitGatewaySubnetAvailableCidrs = getTransitSubnetCidrsFromVpcCidr(vpcCidr);

    // Name tag used for route table and NACL
    const tagKeyName = {
      key: "Name",
      value: `${this.artifactId}/${name}/transitShared`,
    };

    const transitVpcRouteTable = new ec2.CfnRouteTable(this, "transitVpcRouteTable", {
      vpcId: this.vpc.vpcId,
      tags: [tagKeyName],
    });
    this.routeTableIds.transit.push(transitVpcRouteTable.attrRouteTableId);

    const transitGatewayNacl = new ec2.CfnNetworkAcl(this, "transitGatewayNacl", {
      vpcId: this.vpc.vpcId,
      tags: [tagKeyName],
    });
    this.addTransitNacls(transitGatewayNacl.attrId);
    this.naclIds.transit.push(transitGatewayNacl.attrId);

    // Create Transit Gateway Subnets - one per AZ
    this.vpc.availabilityZones.forEach((az, index) => {
      const subnet = new ec2.CfnSubnet(this, `transitSubnet${az}`, {
        vpcId: this.vpc.vpcId,
        availabilityZone: az,
        cidrBlock: transitGatewaySubnetAvailableCidrs[index],
        tags: [
          {
            key: "Name",
            value: `${this.artifactId}/${name}/transitSubnet${index + 1}`,
          },
          // subnetGroupName tag can be used to identify the ISOLATED transit subnets specifically
          {
            key: "aws-cdk:subnet-name",
            value: "transit",
          },
        ],
      });
      this.subnetIds.transit.push(subnet.attrSubnetId);

      // Associate the VPC route table to the transit subnets
      new ec2.CfnSubnetRouteTableAssociation(this, `transitRouteTableAssociation${index}`, {
        routeTableId: this.routeTableIds.transit[0],
        subnetId: subnet.attrSubnetId,
      });

      // Associate the NACL
      new ec2.CfnSubnetNetworkAclAssociation(this, `transitNaclAssociation${index}`, {
        networkAclId: transitGatewayNacl.attrId,
        subnetId: subnet.attrSubnetId,
      });
    });

    this.configureTransitGatewayAttachment(name, transitGatewayProps);
  }

  /**
   * Create a Transit Gateway attachment in all transit subnets
   *
   * If sharedAccountSecretPartialArn is specified, the secret value is retrieved, and the 'id' key is used as the tgw-id.
   * If transitGatewayId is specified, the id is used directly.
   *
   * Only one of the above values may be defined.
   *
   * @param sharedAccountSecretPartialArn - ARN of an AWS Secrets Manager secret without the -xxxxx suffix
   * @param transitGatewayId - E.g. tgw-xxxxxxxxxxx
   */
  private configureTransitGatewayAttachment(name: string, transitGatewayProps: TransitGatewayProps) {
    let transitGateway: string;

    if (transitGatewayProps.sharedAccountSecretPartialArn) {
      const tgwSecret = secretsmanager.Secret.fromSecretPartialArn(
        this,
        "transitGatewaySecret",
        transitGatewayProps.sharedAccountSecretPartialArn
      );
      // unsafeUnwrap is required.  This is *not* a sensitive secret.
      transitGateway = tgwSecret.secretValueFromJson("id").unsafeUnwrap();
    } else {
      if (!transitGatewayProps.transitGatewayId) {
        throw new Error("One of sharedAccountSecretPartialArn or transitGatewayId is required.");
      } else {
        transitGateway = transitGatewayProps.transitGatewayId;
      }
    }

    const attachment = new ec2.CfnTransitGatewayAttachment(this, "tgwAttachment", {
      subnetIds: this.subnetIds.transit,
      transitGatewayId: transitGateway,
      vpcId: this.vpc.vpcId,
      tags: [
        {
          key: "Name",
          value: `${name} vpc <=> shared services transit gateway`,
        },
        {
          key: "description",
          value: "attachment to the Transit Gateway located in the shared services account",
        },
      ],
    });
    this.transitGatewayAttachmentId = attachment.attrId;

    if (transitGatewayProps.routes) {
      Object.entries(transitGatewayProps.routes).forEach((entry) => {
        // subnetType must be cast because Object.entries is a string.  We need the original enum.
        const subnetType: primarySubnetTypes = entry[0] as primarySubnetTypes;
        const cidrs = entry[1] ?? [];

        // For each route table of the particular subnet type
        this.routeTableIds[subnetType].forEach((routeTableId, index) => {
          // Add a transit gateway route for that CIDR
          cidrs.forEach((cidr) => {
            const strippedCidr = stripCidr(cidr);
            const route = new ec2.CfnRoute(this, `${subnetType}${index}${strippedCidr}`, {
              routeTableId,
              transitGatewayId: transitGateway,
              destinationCidrBlock: cidr,
            });
            // Routes cannot be added prior to a successful attachment
            route.addDependency(attachment);
          });
        });
      });
    }
  }

  private createVpcSecurityGroup(name: string, serviceName: string, portNumber: number, protocol: "TCP" | "UDP") {
    this.vpcSecurityGroup = new ec2.SecurityGroup(this, `vpcSg${serviceName}${protocol}${portNumber}`, {
      vpc: this.vpc,
      description: `Allows all ${serviceName} traffic from the VPC CIDR`,
      securityGroupName: name,
    });

    const protocolWithPort = protocol === "TCP" ? ec2.Port.tcp(portNumber) : ec2.Port.udp(portNumber);
    this.vpcSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      protocolWithPort,
      `${serviceName} ingress`
    );
    Tags.of(this.vpcSecurityGroup).add("Name", name);
  }
}

const defaultSubnetConfiguration = [
  {
    cidrMask: 23,
    name: friendlySubnetType.public,
    subnetType: ec2.SubnetType.PUBLIC,
  },
  {
    cidrMask: 23,
    name: friendlySubnetType.private,
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
  },
  {
    cidrMask: 23,
    name: friendlySubnetType.isolated,
    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
  },
];
