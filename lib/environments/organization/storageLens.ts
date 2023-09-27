import { Stack, StackProps, aws_s3 as s3 } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StorageLensBucket } from "@constructs/s3storageLensBucket";
import { validRegion } from "@lib/types";

interface StorageLensProps extends StackProps {
  /**
   * Dashboard Name
   */
  dashboardName: string;
  /**
   * Bucket name
   */
  bucketName: string;
  /**
   * AWS Organization ID
   */
  organizationId: string;
}

export class StorageLens extends Stack {
  constructor(scope: Construct, id: string, props: StorageLensProps) {
    super(scope, id, props);

    const metricExportBucket = new StorageLensBucket(this, "metricExportBucket", {
      bucketName: props.bucketName,
      currentAccountId: this.account,
      currentRegion: this.region as validRegion,
      dashboardName: props.dashboardName,
    });

    new s3.CfnStorageLens(this, "organization-dashboard", {
      storageLensConfiguration: {
        accountLevel: {
          activityMetrics: {
            isEnabled: true,
          },
          advancedCostOptimizationMetrics: {
            isEnabled: true,
          },
          advancedDataProtectionMetrics: {
            isEnabled: true,
          },
          detailedStatusCodesMetrics: {
            isEnabled: true,
          },
          bucketLevel: {
            activityMetrics: {
              isEnabled: true,
            },
            // Implicitly dependent on the same setting in the accountLevel object
            advancedCostOptimizationMetrics: {
              isEnabled: true,
            },
            // Implicitly dependent on the same setting in the accountLevel object
            advancedDataProtectionMetrics: {
              isEnabled: true,
            },
            // Implicitly dependent on the same setting in the accountLevel object
            detailedStatusCodesMetrics: {
              isEnabled: true,
            },
            prefixLevel: {
              storageMetrics: {
                isEnabled: true,
                selectionCriteria: {
                  delimiter: "/",
                  maxDepth: 5,
                  minStorageBytesPercentage: 3,
                },
              },
            },
          },
        },
        id: props.dashboardName,
        isEnabled: true,
        awsOrg: {
          arn: `arn:aws:organizations::${this.account}:organization/${props.organizationId}`,
        },
        dataExport: {
          cloudWatchMetrics: {
            isEnabled: true,
          },
          s3BucketDestination: {
            accountId: this.account,
            arn: metricExportBucket.bucket.bucketArn,
            encryption: {
              sses3: {},
            },
            prefix: "organization",
            format: "CSV",
            outputSchemaVersion: "V_1",
          },
        },
      },
    });
  }
}
