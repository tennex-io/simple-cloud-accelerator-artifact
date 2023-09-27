import { MinimumRequiredTags } from "@lib/types";
import { Tags } from "aws-cdk-lib";
import { IConstruct } from "constructs";

/**
 * Tags a CDK construct with the minimum required tags
 *
 * @param bucket CDK Bucket
 * @param tags Minimum required tags defined in the taggingConfig file
 */
export function addRequiredTags(construct: IConstruct, tags: MinimumRequiredTags) {
  Object.entries(tags).forEach(([key, value]) => {
    Tags.of(construct).add(key, value);
  });
}

/**
 * Validate an Email address with via regular expression
 *
 * @param emailAddress email address
 * @returns boolean
 */
export function isValidEmailAddress(emailAddress: string): boolean {
  const regex = /^([a-zA-Z0-9_\-.]+)@([a-zA-Z0-9_\-.]+)\.([a-zA-Z]{2,5})$/;
  return regex.test(emailAddress);
}
