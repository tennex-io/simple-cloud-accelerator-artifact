import { AthenaCloudTrailCreateTables } from "@customResources/athenaCloudTrailCreateTable";
import { aws_athena as athena, aws_iam as iam, aws_glue as glue, aws_s3 as s3, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { createTable } from "./cloudtrail-athena/queries";
import { cloudTrailDetails } from "@config/coreConfig";

interface AthenaCloudTrailProps extends StackProps {
  /**
   * CloudTrail properties
   */
  cloudTrailDetails: typeof cloudTrailDetails;
  /**
   * Organization ID
   */
  organizationId: string;
}

export class AthenaCloudTrail extends Stack {
  constructor(scope: Construct, id: string, props: AthenaCloudTrailProps) {
    super(scope, id, props);

    const { cloudtrailOrganizationBucketName, dataTrailS3LoggingPrefix, primaryTrailS3LoggingPrefix } =
      props.cloudTrailDetails;
    const bucket = new s3.Bucket(this, "athenaOutputBucket", {
      bucketName: `athena-cloudtrail-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      blockPublicAccess: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
    });

    const database = new glue.CfnDatabase(this, "database", {
      catalogId: this.account,
      databaseInput: {
        description: "CloudTrail S3 Source",
        name: "cloudtrail",
      },
    });

    const workGroup = new athena.CfnWorkGroup(this, "workgroup", {
      name: "cloudtrail",
      description: "CloudTrail S3 workgroup",
      workGroupConfiguration: {
        engineVersion: {
          // Use the ListEngineVersions API for versions - https://docs.aws.amazon.com/athena/latest/APIReference/API_ListEngineVersions.html
          selectedEngineVersion: "Athena engine version 3",
        },
        resultConfiguration: {
          outputLocation: `s3://${bucket.bucketName}`,
        },
      },
    });

    const managementS3uri = `s3://${cloudtrailOrganizationBucketName}/${primaryTrailS3LoggingPrefix}/AWSLogs/${props.organizationId}/`;
    const queryCreateManagementTable = new athena.CfnNamedQuery(this, "queryCreateManagementTable", {
      database: database.ref,
      queryString: createTable("management_events", managementS3uri),
      name: "create-organziation-management-table",
      workGroup: workGroup.ref,
    });

    const dataEventS3uri = `s3://${cloudtrailOrganizationBucketName}/${dataTrailS3LoggingPrefix}/AWSLogs/${props.organizationId}/`;
    const queryCreateDataEventTable = new athena.CfnNamedQuery(this, "queryCreateDataEventTable", {
      database: database.ref,
      queryString: createTable("data_events", dataEventS3uri),
      name: "create-organziation-data-event-table",
      workGroup: workGroup.ref,
    });

    const lambdaRole = new iam.Role(this, "athenaCloudtrailRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "manages Lambda access to Athena resourcess  [for Athena/CloudTrail operations",
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
      inlinePolicies: {
        athenaAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: "athenaExecute",
              actions: ["athena:StartQueryExecution", "athena:GetNamedQuery", "athena:GetQueryExecution"],
              resources: [`arn:aws:athena:*:${this.account}:workgroup/${workGroup.ref}`],
            }),
            new iam.PolicyStatement({
              sid: "glueDefaultCatalogRead",
              actions: ["glue:GetDatabase", "glue:GetTable", "glue:CreateTable"],
              resources: [
                `arn:aws:glue:*:${this.account}:database/${database.ref}`,
                `arn:aws:glue:*:${this.account}:catalog`,
                `arn:aws:glue:*:${this.account}:table/${database.ref}/*`,
              ],
            }),
            new iam.PolicyStatement({
              sid: "s3AthenaOutputFull",
              actions: [
                "s3:GetBucketLocation",
                "s3:GetObject",
                "s3:ListBucket",
                "s3:ListBucketMultipartUploads",
                "s3:ListMultipartUploadParts",
                "s3:AbortMultipartUpload",
                "s3:CreateBucket",
                "s3:PutObject",
              ],
              resources: [bucket.bucketArn, bucket.arnForObjects("*")],
            }),
          ],
        }),
        cloudTrailAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: "s3LogBucketList",
              actions: ["s3:ListBucket"],
              resources: [`arn:aws:s3:::${props.cloudTrailDetails.cloudtrailOrganizationBucketName}`],
            }),
            new iam.PolicyStatement({
              sid: "s3LogBucketGet",
              actions: ["s3:GetObject"],
              resources: [`arn:aws:s3:::${props.cloudTrailDetails.cloudtrailOrganizationBucketName}/*`],
            }),
          ],
        }),
      },
    });

    // Create two tables, one for management events and one for data events
    new AthenaCloudTrailCreateTables(this, `customResourceAthenaCloudTrailTables}`, {
      functionRole: lambdaRole,
      namedQueryIds: [queryCreateManagementTable.attrNamedQueryId, queryCreateDataEventTable.attrNamedQueryId],
      database: database.ref,
      workGroup: workGroup.ref,
    });
  }
}
