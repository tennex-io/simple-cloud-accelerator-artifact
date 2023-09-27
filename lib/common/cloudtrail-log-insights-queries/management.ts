import { aws_logs as logs } from "aws-cdk-lib";

export const managementQueries: Record<string, logs.QueryString> = {
  // IAM Access denied
  "access-denied": new logs.QueryString({
    fields: ["@timestamp", "eventSource", "eventName", "errorCode", "errorMessage"],
    filterStatements: ["ispresent(errorCode)"],
    sort: "@timestamp desc",
  }),

  // Highest frequency API calls by region
  "highest-frequency-api-calls": new logs.QueryString({
    fields: ["@timestamp, @message"],
    stats: "count(*) as count by eventSource, eventName, awsRegion",
    sort: "count desc",
  }),

  // Most active IAM users
  "most-active-iam-users": new logs.QueryString({
    filterStatements: ['userIdentity.type = "IAMUser"'],
    stats: "count() by userIdentity.arn",
    sort: "by count",
  }),

  // Security group changes
  "security-group-changes": new logs.QueryString({
    fields: ["@timestamp, @message"],
    filterStatements: [
      'eventSource = "ec2.amazonaws.com"',
      '(eventName = "AuthorizeSecurityGroupEgress" or eventName = "AuthorizeSecurityGroupIngress" or eventName = "RevokeSecurityGroupEgress" or eventName = "RevokeSecurityGroupIngress")',
    ],
  }),
};
