import { CurBucket } from "@constructs/s3costAndUsageBucket";
import { aws_cur as cur, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface CostAndUsageProps extends StackProps {
  /**
   * Create the text/CSV report
   *
   * @default true
   */
  createRedshiftQuickSightReport?: boolean;
  /**
   * Explicitly name the text/CSV report
   *
   * @default primary-redshift-quicksight
   */
  redshiftQuickSightReportName?: string;
  /**
   * Create the parquet report
   *
   * @default true
   */
  createAthenaReport?: boolean;
  /**
   * Explicitly name the parquet report
   *
   * @default primary-athena
   */
  athenaReportName?: string;
}

export class CostAndUsage extends Stack {
  constructor(scope: Construct, id: string, props: CostAndUsageProps) {
    super(scope, id, props);

    const redshiftQuickSightReportName = props.athenaReportName || "primary-redshift-quicksight";
    const createRedshiftQuickSightReport = props.createRedshiftQuickSightReport || true;
    const createAthenaReport = props.createAthenaReport || true;
    const athenaReportName = props.athenaReportName || "primary-athena";

    const curBucket = new CurBucket(this, "curBucket", this.account, this.region);

    if (createRedshiftQuickSightReport) {
      new cur.CfnReportDefinition(this, "cur", {
        additionalArtifacts: ["REDSHIFT", "QUICKSIGHT"], // ATHENA requires parquet for compression and format
        additionalSchemaElements: ["RESOURCES"],
        compression: "GZIP",
        format: "textORcsv",
        refreshClosedReports: true,
        reportName: redshiftQuickSightReportName,
        reportVersioning: "CREATE_NEW_REPORT",
        s3Bucket: curBucket.bucket.bucketName,
        s3Prefix: "cur",
        s3Region: this.region,
        timeUnit: "HOURLY",
      });
    }

    if (createAthenaReport) {
      new cur.CfnReportDefinition(this, "curAthena", {
        additionalArtifacts: ["ATHENA"],
        additionalSchemaElements: ["RESOURCES"],
        compression: "Parquet",
        format: "Parquet",
        refreshClosedReports: true,
        reportName: athenaReportName,
        reportVersioning: "OVERWRITE_REPORT", // Athena does not support CREATE_NEW_REPORT
        s3Bucket: curBucket.bucket.bucketName,
        s3Prefix: "cur-athena",
        s3Region: this.region,
        timeUnit: "HOURLY",
      });
    }
  }
}
