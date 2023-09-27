import { MetadataBearer } from "@aws-sdk/types";
import { CloudFormationCustomResourceEvent } from "aws-lambda";

export const mockMetadata: MetadataBearer = {
  $metadata: {
    httpStatusCode: 200,
    requestId: "99999999-9999-9999-9999-999999999999",
    attempts: 1,
    totalRetryDelay: 0,
  },
};

export const inputEventCreateBase: CloudFormationCustomResourceEvent = {
  RequestType: "Create",
  ResourceProperties: {
    ServiceToken: "test",
  },
  LogicalResourceId: "test",
  ResponseURL: "test",
  StackId: "test",
  RequestId: "test",
  ResourceType: "test",
  ServiceToken: "test",
};
