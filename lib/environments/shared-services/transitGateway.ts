import { SecretsManagerOrganizationSharedSecret } from "@constructs/secretsManagerOrganizationSharedSecret";
import { aws_ec2 as ec2, aws_kms as kms, aws_ram as ram, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface TransitGatewayProps extends StackProps {
  /**
   * AWS Account ID of the Organization Management Account
   *
   * @example 112233445566
   */
  organizationAccountId: string;
  /**
   * AWS Organization ID of the Management Account
   *
   * @example o-123456
   */
  organizationId: string;
  /**
   * Secret Name
   *
   * A Secrets Manager secret is created with a policy that allows read access
   * to all Organization accounts.
   *
   * @default transitGateway
   */
  secretName?: string;
  /**
   * Organization shared KMS Key
   *
   * Used to encrypt the secret, this key allows Organization members decrypt functionality
   * for the Transit Gateway ID
   */
  kmsKey: kms.IKey;
}

export class TransitGateway extends Stack {
  public readonly id: string;
  public readonly routeTableId: string;

  constructor(scope: Construct, id: string, props: TransitGatewayProps) {
    super(scope, id, props);

    const transitGateway = new ec2.CfnTransitGateway(this, "tgw", {
      autoAcceptSharedAttachments: "enable",
      description: "organization shared gateway",
      defaultRouteTableAssociation: "enable",
      defaultRouteTablePropagation: "enable",
      tags: [
        {
          key: "Name",
          value: "organization-shared",
        },
      ],
    });

    this.id = transitGateway.attrId;
    const tgwArn = `arn:aws:ec2:${this.region}:${this.account}:transit-gateway/${this.id}`;

    new ram.CfnResourceShare(this, "tgwShare", {
      name: "organization-shared-transit-gateway",
      allowExternalPrincipals: false,
      permissionArns: ["arn:aws:ram::aws:permission/AWSRAMDefaultPermissionTransitGateway"],
      principals: [`arn:aws:organizations::${props.organizationAccountId}:organization/${props.organizationId}`],
      resourceArns: [tgwArn],
    });

    new SecretsManagerOrganizationSharedSecret(this, "tgwSecret", {
      description: "Shared Transit Gateway Details",
      secretName: props.secretName ?? "transitGateway",
      kmsKeyId: props.kmsKey,
      organizationId: props.organizationId,
      secretValue: this.id,
    });
  }
}
