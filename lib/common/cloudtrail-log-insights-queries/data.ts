import { aws_logs as logs } from "aws-cdk-lib";

export const dataQueries: Record<string, logs.QueryString> = {
  // Access denied to S3
  "access-denied": new logs.QueryString({
    fields: ["@timestamp", "eventSource", "requestParameters.bucketName", "eventName", "errorCode", "errorMessage"],
    filterStatements: ["ispresent(errorCode)"],
    sort: "@timestamp desc",
  }),

  // Top bucket PutObject errors by bucket
  "top-put-errors-by-bucket": new logs.QueryString({
    fields: ["requestParameters.bucketName", "errorCode"],
    filterStatements: ["ispresent(errorCode)", "eventName = 'PutObject'"],
    stats: "count() as count by requestParameters.bucketName",
    sort: "count desc",
  }),

  // Access denied in a specific bucket
  "specific-bucket-access-denied": new logs.QueryString({
    fields: ["@timestamp", "userIdentity.type", "eventName", "errorCode", "errorMessage", "@message"],
    filterStatements: [
      "ispresent(errorCode)",
      "eventName = 'PutObject'",
      "requestParameters.bucketName = '**YOUR_BUCKET_NAME_HERE**'",
    ],
  }),

  // Errors by userIdentity on a specific bucket
  "bucket-errors-by-user-identity": new logs.QueryString({
    fields: ["userIdentity.arn"],
    filterStatements: ["ispresent(errorCode)", "requestParameters.bucketName = '**YOUR_BUCKET_NAME_HERE**'"],
    stats: "count() as count by userIdentity.arn",
    sort: "count desc",
  }),

  // Failed events by eventName on a specific bucket
  "api-event-error-counts": new logs.QueryString({
    fields: ["eventName"],
    filterStatements: ["ispresent(errorCode)", "requestParameters.bucketName = '**YOUR_BUCKET_NAME_HERE**'"],
    stats: "count() as count by eventName",
    sort: "cound desc",
  }),
};
