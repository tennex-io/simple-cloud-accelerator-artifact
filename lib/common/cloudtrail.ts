import { CloudTrailKmsKey } from "@constructs/kmsCloudTrailKey";
import { CloudTrailBucket } from "@constructs/s3cloudTrailBucket";
import { S3Props } from "@lib/types";
import {
  aws_cloudtrail as cloudtrail,
  aws_kms as kms,
  aws_logs as logs,
  aws_s3 as s3,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { managementQueries } from "./cloudtrail-log-insights-queries/management";
import { dataQueries } from "./cloudtrail-log-insights-queries/data";

interface BucketLoggingProps {
  /**
   * Name of the logging bucket
   */
  bucketName: string;
}

interface DataEventLogging {
  /**
   * Buckets to log data events for
   *
   * @default cloudtrail.ReadWriteType.NONE
   */
  allBuckets?: cloudtrail.ReadWriteType;
  /**
   * List of buckets names to log read events for
   */
  readBuckets?: BucketLoggingProps[];
  /**
   * List of buckets names to log write events for
   */
  writeBuckets?: BucketLoggingProps[];
  /**
   * List of buckets names to log read and write events for
   */
  readWriteBuckets?: BucketLoggingProps[];
}

interface OrganizationProps {
  /**
   * Organization ID - E.g. o-u4999999999
   */
  id: string;
  /**
   * Organization management account ID
   */
  managementAccountId: string;
  /**
   * List of accounts IDs in the organization
   * Used for KMS encryption and optional cross account S3 log delivery
   */
  memberAccountIds: string[];
}

interface TrailProps {
  /**
   * CloudTrail Insights
   */
  insightsProps?: {
    monitorApiRate: boolean;
    monitorApiErrorRate: boolean;
  };
  /**
   * Clouwatch log group retention
   *
   * @default SIX_MONTHS
   */
  logGroupRetention?: logs.RetentionDays;
  /**
   * Trail is for an organization
   *
   * @default false
   */
  isOrganizationTrail?: boolean;
  /**
   * Deliver the logs to CloudWatch logs
   *
   * @default false
   */
  logToCloudWatchLogs?: boolean;
  /**
   * CloudWatch Log group prefix
   *
   * @default /cloudtrail/
   */
  logGroupPrefix?: string;
  /**
   * Specific name of the trail
   *
   */
  name: string;
  /**
   * S3 prefix. Logs will be delivered to S3 in <PREFIX>/AWSLogs/*
   *
   * @default undefined
   */
  s3LoggingPrefix?: string;
  /**
   * Type of management event to log
   *
   * MANAGEMENT - log all management events
   * MANAGEMENT_WITH_DATA - log all management events and data events
   * DATA - log no management events, but data events must be added
   *
   * @default MANAGEMENT
   */
  trailType?: "MANAGEMENT" | "DATA" | "MANAGEMENT_WITH_DATA";
  /**
   *
   */
  dataEventLogging?: DataEventLogging;
}

export interface CloudtrailProps extends StackProps {
  /**
   * S3 bucket properties
   */
  s3Props: S3Props;
  /** Existing KMS key
   *
   * @default a new key with the alias 'cloudtrail' is created
   */
  kmsKey?: string;
  /**
   * AWS Organization properties
   */
  organizationProps?: OrganizationProps;
  /**
   * CloudTrail Trail properties
   * Defining this stack without a trail can set up S3 and KMS in a spoke logging account
   *
   * @default no trail is created
   */
  trailProps?: TrailProps;
}

export class Cloudtrail extends Stack {
  public kmsKey: kms.Key;

  public trail: cloudtrail.Trail;

  public dataTrail: cloudtrail.Trail;

  public bucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: CloudtrailProps) {
    super(scope, id, props);

    // If no key is supplied, create one
    if (!props.kmsKey) {
      const cloudTrailKmsKey = new CloudTrailKmsKey(this, "cloudTrailKmsKey", {
        currentAccountId: this.account,
        memberAccountIds: props.organizationProps?.memberAccountIds,
      });
      this.kmsKey = cloudTrailKmsKey.kmsKey;
    }

    // If no bucket is supplied, create one and adjust the policy for org/non-org
    // Bucket creation or context from existing bucket
    if (props.s3Props.isExistingBucket) {
      this.bucket = s3.Bucket.fromBucketName(this, "bucket", props.s3Props.bucketName);
    } else {
      const cloudTrailBucket = new CloudTrailBucket(this, "cloudTrailBucket", {
        bucketName: props.s3Props.bucketName,
        isOrganizationBucket: props.s3Props.isOrganizationBucket || false,
        kmsKey: this.kmsKey,
        organizationManagementAccountId: props.organizationProps?.managementAccountId,
      });
      this.bucket = cloudTrailBucket.bucket;
    }

    // Trail is the core resource, so we'll manage it at the top level
    if (props.trailProps) {
      const { trailProps } = props;
      let logGroup;
      if (trailProps.logToCloudWatchLogs) {
        const logGroupPrefix = trailProps.logGroupPrefix ?? "/cloudtrail/";
        logGroup = new logs.LogGroup(this, "logGroup", {
          logGroupName: `${logGroupPrefix}${trailProps.name}`,
          retention: trailProps.logGroupRetention || logs.RetentionDays.SIX_MONTHS,
          removalPolicy: RemovalPolicy.DESTROY,
        });
      }

      let insightTypes: cloudtrail.InsightType[] | undefined;
      if (trailProps.insightsProps) {
        insightTypes = [];
        if (trailProps.insightsProps.monitorApiRate) insightTypes.push(cloudtrail.InsightType.API_CALL_RATE);
        if (trailProps.insightsProps.monitorApiErrorRate) insightTypes.push(cloudtrail.InsightType.API_ERROR_RATE);
      }
      this.trail = new cloudtrail.Trail(this, "trail", {
        bucket: this.bucket,
        cloudWatchLogGroup: logGroup,
        enableFileValidation: true,
        encryptionKey: props.kmsKey ? kms.Key.fromKeyArn(this, "trailKeyAlias", props.kmsKey) : this.kmsKey,
        includeGlobalServiceEvents: true,
        isMultiRegionTrail: true,
        isOrganizationTrail: true,
        managementEvents: props.trailProps.trailType === "DATA" ? undefined : cloudtrail.ReadWriteType.ALL,
        sendToCloudWatchLogs: trailProps.logToCloudWatchLogs || false,
        s3KeyPrefix: trailProps.s3LoggingPrefix,
        insightTypes,
        trailName: trailProps.name,
      });

      // If logging to CloudWatch, add some potentially useful queries to CloudWatch Log Insights
      if (trailProps.logToCloudWatchLogs) {
        if (trailProps.trailType === "MANAGEMENT") {
          this.createQueries("cloudtrail", managementQueries);
        }
        if (trailProps.trailType === "DATA") {
          this.createQueries("s3", dataQueries);
        }
      }

      if (trailProps.dataEventLogging) {
        const { dataEventLogging } = trailProps;

        // Handle optional logging of all bucket data events
        const logAllBucketEvents = dataEventLogging.allBuckets || cloudtrail.ReadWriteType.NONE;
        if (logAllBucketEvents !== cloudtrail.ReadWriteType.NONE) {
          this.trail.addEventSelector(cloudtrail.DataResourceType.S3_OBJECT, ["arn:aws:s3"], {
            includeManagementEvents: false,
            readWriteType: logAllBucketEvents,
          });
        }
      }
    }
  }

  private createQueries(prefix: string, queries: Record<string, logs.QueryString>) {
    Object.entries(queries).forEach(([name, queryString]) => {
      new logs.QueryDefinition(this, name, {
        queryDefinitionName: `${prefix}/${name}`,
        queryString,
        logGroups: [this.trail.logGroup!],
      });
    });
  }
}
