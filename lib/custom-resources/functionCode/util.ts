import { CloudFormationCustomResourceEvent } from "aws-lambda";

// Types and Interfaces

// The standard CloudFormationCustomResourceEvent type does not have 'OldResourceProperties'
interface CloudFormationCustomResourceEventExtended {
  OldResourceProperties: Record<string, any>;
}

export type CustomResourceEvent = CloudFormationCustomResourceEvent & CloudFormationCustomResourceEventExtended;

// Utility functions shared by constructs

export async function sleep(seconds: number) {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
