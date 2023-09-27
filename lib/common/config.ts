import { ConfigBucket } from "@constructs/s3configBucket";
import { S3Props } from "@lib/types";
import { aws_config as config, aws_iam as iam, aws_s3 as s3, Stack, StackProps } from "aws-cdk-lib";
import { CfnServiceLinkedRole, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface OrganizationProps {
  /**
   * Organization ID - E.g. o-u4999999999
   */
  id: string;
  /**
   * List of accounts IDs in the organization
   * Used for KMS encryption and optional cross account S3 log delivery
   */
  memberAccountIds: string[];
  /**
   * Deploy Config Aggregator and Role
   *
   * In an AWS Organization, this should be deployed in the AWS Config administrator account
   * @default false
   */
  deployConfigOrganizationAggregator?: boolean;
}

export interface ConfigProps extends StackProps {
  /**
   * S3 bucket properties
   */
  s3Props: S3Props;
  /**
   * AWS Organization properties
   */
  organizationProps?: OrganizationProps;
  /**
   * Create Config IAM service role
   *
   * Set this to false if config is already deployed in another region for this account.
   *
   * @default true
   */
  createIamServiceRole?: boolean;
  /**
   * Delivery Frequency
   *
   * Allowed Values: One_Hour | Six_Hours | Three_Hours | Twelve_Hours | TwentyFour_Hours
   * @default One_Hour
   */
  deliveryFrequency?: "One_Hour" | "Six_Hours" | "Three_Hours" | "Twelve_Hours" | "TwentyFour_Hours";
}

export class Config extends Stack {
  public bucket: s3.IBucket;
  public serviceRole: iam.IRole;

  constructor(scope: Construct, id: string, props: ConfigProps) {
    super(scope, id, props);

    // If no bucket is supplied, create one and adjust the policy for org/non-org
    // Bucket creation or context from existing bucket
    if (props.s3Props.isExistingBucket) {
      this.bucket = s3.Bucket.fromBucketName(this, "bucket", props.s3Props.bucketName);
    } else {
      const configBucket = new ConfigBucket(this, "configBucket", {
        bucketName: props.s3Props.bucketName,
        isOrganizationBucket: props.s3Props.isOrganizationBucket || false,
        currentAccountId: this.account,
        organizationAccountIds: props.organizationProps?.memberAccountIds,
      });
      this.bucket = configBucket.bucket;
    }

    // Optionally create the service role.
    const createIamServiceRole = props.createIamServiceRole ?? true;
    let serviceRole: iam.CfnServiceLinkedRole | undefined;
    if (createIamServiceRole) {
      serviceRole = new CfnServiceLinkedRole(this, "iamServiceRole", { awsServiceName: "config.amazonaws.com" });
    }

    const recorder = new config.CfnConfigurationRecorder(this, "recorder", {
      roleArn: `arn:aws:iam::${this.account}:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig`,
    });

    // If we created the service role, we need creation the role created before the recorder.
    if (serviceRole) recorder.addDependency(serviceRole!);

    new config.CfnDeliveryChannel(this, "deliveryChannel", {
      s3BucketName: props.s3Props.bucketName || this.bucket.bucketName,
      configSnapshotDeliveryProperties: {
        deliveryFrequency: props.deliveryFrequency || "One_Hour",
      },
    });

    // Organization Config Aggregator
    if (props.organizationProps?.deployConfigOrganizationAggregator) {
      const configAggregatorRole = new iam.Role(this, "configAggregatorRole", {
        assumedBy: new ServicePrincipal("config.amazonaws.com"),
        description: "Organization AWS Config aggregator",
        roleName: "config-organization-aggregator",
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSConfigRoleForOrganizations")],
      });

      new config.CfnConfigurationAggregator(this, "configAggregator", {
        organizationAggregationSource: {
          roleArn: configAggregatorRole.roleArn,
          allAwsRegions: true,
        },
        configurationAggregatorName: "organization",
      });
    }
  }
}
